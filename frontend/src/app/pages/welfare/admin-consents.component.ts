import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface SubCounts { total: number; signed: number; pending: number; declined?: number }
interface ConsentForm { id: string; title: string; type: string; body: string; status: string; dueDate?: string; requiresSignature: boolean; submissions?: any }
interface Submission { id: string; formId: string; studentId?: string; studentName?: string; parentName?: string; status: string; signatureName?: string; signedAt?: string; form?: ConsentForm }
interface ConsentsOverview { forms: number; published: number; archived: number; overdue: number; signed: number; pending: number; declined: number }

const TYPES = ['trip', 'media', 'policy', 'medical', 'general'];

@Component({
  selector: 'app-admin-consents',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout [portalTitle]="isParent?'Parent Portal':'Admin Portal'" pageTitle="Consent Forms" [navSections]="isParent?[]:adminNav" [navItems]="isParent?parentNav:[]">

<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">Student welfare</p>
    <h2 class="wf-title">Consent Forms</h2>
    <p class="wf-sub">
      @if (isParent) { Read each form carefully, then sign or decline on behalf of your child. }
      @else { Publish consent and permission forms, then track who has signed, declined or is still pending. }
    </p>
  </div>
  <div class="wf-stats">
    @if (isParent) {
      <div class="wf-stat"><strong>{{ awaitingCount }}</strong><span>Awaiting you</span></div>
      <div class="wf-stat"><strong>{{ myForms.length }}</strong><span>Forms</span></div>
    } @else {
      <div class="wf-stat"><strong>{{ ov()?.published ?? 0 }}</strong><span>Published</span></div>
      <div class="wf-stat"><strong>{{ ov()?.signed ?? 0 }}</strong><span>Signed</span></div>
      <div class="wf-stat"><strong>{{ ov()?.pending ?? 0 }}</strong><span>Pending</span></div>
      <div class="wf-stat"><strong>{{ ov()?.overdue ?? 0 }}</strong><span>Overdue forms</span></div>
    }
  </div>
</header>

<div class="card">
  @if (notice(); as n) {
    <div class="wf-notice" [class.ok]="n.kind==='ok'" [class.bad]="n.kind==='bad'" role="status">{{ n.text }}</div>
  }

  @if (isParent) {
    <div class="wf-section"><h3>Forms awaiting your signature</h3><small>{{ myForms.length }} form{{ myForms.length === 1 ? '' : 's' }}</small></div>
    @for (f of myForms; track f.id) {
      <article class="wf-consent">
        <div class="wf-consent-head">
          <h4>{{ f.title }}</h4>
          <div class="wf-tags" style="margin:0">
            <span class="wf-pill alt">{{ f.type }}</span>
            @if (f.dueDate) { <span class="wf-pill" [class.bad]="isOverdue(f)">Due {{ f.dueDate | date:'d MMM y' }}</span> }
          </div>
        </div>
        <p class="wf-consent-body">{{ f.body }}</p>
        @for (sub of f.submissions || []; track sub.studentId) {
          <div class="wf-consent-child">
            <div class="wf-person"><span class="wf-disc">{{ initials(sub.studentName) }}</span><span class="wf-person-name">{{ sub.studentName || 'Child' }}</span></div>
            <span class="wf-pill" [class.ok]="sub.status==='signed'" [class.bad]="sub.status==='declined'" [class.warn]="sub.status==='pending'">{{ sub.status }}</span>
            @if (sub.status === 'pending') {
              <input [(ngModel)]="signName" placeholder="Type your full name to sign" />
              <button type="button" class="btn-primary" (click)="sign(f, sub, 'signed')">Sign</button>
              <button type="button" class="btn-outline" (click)="sign(f, sub, 'declined')">Decline</button>
            }
          </div>
        }
      </article>
    } @empty {
      <div class="wf-empty"><strong>Nothing to sign right now</strong><span>New consent forms from the school will appear here.</span></div>
    }
  } @else {
    <div class="tab-bar" role="tablist">
      <button type="button" role="tab" [class.active]="tab==='forms'" [attr.aria-selected]="tab==='forms'" (click)="tab='forms'">Forms<span class="wf-count">{{ forms.length }}</span></button>
      <button type="button" role="tab" [class.active]="tab==='subs'" [attr.aria-selected]="tab==='subs'" (click)="openSubs()">Submissions<span class="wf-count">{{ submissionTabCount() }}</span></button>
    </div>

    <div class="wf-bar">
      @if (tab==='forms') {
        <label class="wf-field"><span>Type</span>
          <select [(ngModel)]="typeFilter" (change)="loadForms()"><option value="">All types</option>@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select>
        </label>
      } @else {
        <label class="wf-field"><span>Status</span>
          <select [(ngModel)]="subStatus" (change)="loadSubs()"><option value="">All statuses</option><option value="signed">Signed</option><option value="pending">Pending</option><option value="declined">Declined</option></select>
        </label>
      }
      <span class="wf-spacer"></span>
      <button type="button" class="btn-primary" (click)="showForm=!showForm; tab='forms'">+ New form</button>
    </div>

    @if (showForm) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">New consent form</h4>
        <label class="wf-field"><span>Title</span><input [(ngModel)]="form.title" placeholder="e.g. Grade 5 museum trip" /></label>
        <label class="wf-field"><span>Type</span><select [(ngModel)]="form.type">@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select></label>
        <label class="wf-field"><span>Due date</span><input [(ngModel)]="form.dueDate" type="date" /></label>
        <label class="wf-check"><input type="checkbox" [(ngModel)]="form.requiresSignature" /> Requires signature</label>
        <label class="wf-field wide"><span>Form text / consent wording</span><textarea [(ngModel)]="form.body" placeholder="Explain what parents are consenting to…" rows="5"></textarea></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveForm()">Publish</button>
          <button type="button" class="btn-outline" (click)="showForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (tab==='forms') {
      <div class="table-scroll"><table class="data-table wf-table">
        <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Submissions</th><th>Due</th><th></th></tr></thead>
        <tbody>
          @for (f of forms; track f.id) {
            <tr>
              <td class="wf-strong">{{ f.title }}</td>
              <td><span class="wf-pill alt">{{ f.type }}</span></td>
              <td><span class="wf-pill" [class.ok]="f.status==='published'" [class.muted]="f.status!=='published'">{{ f.status }}</span></td>
              <td>
                <div class="wf-progress">
                  <div class="wf-progress-track"><div class="wf-progress-fill" [style.width.%]="pct(f)"></div></div>
                  <small>{{ f.submissions?.signed || 0 }} / {{ f.submissions?.total || 0 }} signed</small>
                </div>
              </td>
              <td>
                @if (f.dueDate) { <span [class.wf-pts]="isOverdue(f)" [class.neg]="isOverdue(f)">{{ f.dueDate | date:'d MMM y' }}</span> } @else { <span class="wf-muted">—</span> }
              </td>
              <td><div class="wf-row-actions">
                <button type="button" class="btn-outline" (click)="viewFormSubs(f)">Responses</button>
                <button type="button" class="btn-outline" (click)="archive(f)">{{ f.status==='published'?'Archive':'Publish' }}</button>
              </div></td>
            </tr>
          } @empty {
            <tr class="wf-empty-row"><td colspan="6"><div class="wf-empty-inline"><strong>No forms</strong><span>Create a form to start collecting consent from parents.</span></div></td></tr>
          }
        </tbody>
      </table></div>
    } @else {
      <div class="table-scroll"><table class="data-table wf-table">
        <thead><tr><th>Form</th><th>Parent</th><th>Student</th><th>Status</th><th>Signed</th><th>Signature</th></tr></thead>
        <tbody>
          @for (s of submissions; track s.id) {
            <tr>
              <td class="wf-strong">{{ s.form?.title }}</td>
              <td>{{ s.parentName || '—' }}</td>
              <td>{{ s.studentName || '—' }}</td>
              <td><span class="wf-pill" [class.ok]="s.status==='signed'" [class.bad]="s.status==='declined'" [class.warn]="s.status==='pending'">{{ s.status }}</span></td>
              <td>@if (s.signedAt) { {{ s.signedAt | date:'d MMM y, HH:mm' }} } @else { <span class="wf-muted">—</span> }</td>
              <td>{{ s.signatureName || '—' }}</td>
            </tr>
          } @empty {
            <tr class="wf-empty-row"><td colspan="6"><div class="wf-empty-inline"><strong>No submissions</strong><span>Responses will appear here as parents sign or decline.</span></div></td></tr>
          }
        </tbody>
      </table></div>
    }
  }
</div>
</app-portal-layout>`,
})
export class AdminConsentsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;
  readonly types = TYPES;

  get isParent() { return this.auth.user()?.role === 'parent'; }
  tab: 'forms' | 'subs' = 'forms';
  forms: ConsentForm[] = [];
  myForms: ConsentForm[] = [];
  submissions: Submission[] = [];
  showForm = false; typeFilter = ''; subStatus = ''; subFormId = ''; signName = '';
  form: any = { type: 'general', requiresSignature: true, status: 'published' };
  ov = signal<ConsentsOverview | null>(null);

  /** Count shown on the Submissions tab. Safe before the overview has loaded. */
  submissionTabCount(): number {
    const o = this.ov();
    return o ? o.signed + o.pending + o.declined : this.submissions.length;
  }
  notice = signal<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  private noticeTimer: any;

  get awaitingCount() {
    return this.myForms.reduce((n, f) => n + (f.submissions || []).filter((s: any) => s.status === 'pending').length, 0);
  }

  ngOnInit() {
    if (this.isParent) { this.loadMy(); } else { this.loadForms(); this.loadOverview(); }
  }

  initials(name?: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
  }

  pct(f: ConsentForm) {
    const s: SubCounts | undefined = f.submissions;
    return s && s.total ? Math.round((s.signed / s.total) * 100) : 0;
  }

  isOverdue(f: ConsentForm) {
    return !!f.dueDate && f.status !== 'archived' && f.dueDate < new Date().toISOString().slice(0, 10);
  }

  private flash(text: string, kind: 'ok' | 'bad' = 'ok') {
    clearTimeout(this.noticeTimer);
    this.notice.set({ kind, text });
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4500);
  }
  private fail(e: any, fallback: string) { this.flash(e?.error?.message || fallback, 'bad'); }

  loadOverview() {
    this.api.get<ConsentsOverview>('/consents/overview').subscribe({ next: (r) => this.ov.set(r), error: () => {} });
  }

  loadForms() {
    const p: any = {};
    if (this.typeFilter) p.type = this.typeFilter;
    this.api.get<ConsentForm[]>('/consents/forms', p).subscribe({ next: (r) => (this.forms = r || []), error: () => {} });
  }

  openSubs() { this.subFormId = ''; this.tab = 'subs'; this.loadSubs(); }

  viewFormSubs(f: ConsentForm) { this.subFormId = f.id; this.subStatus = ''; this.tab = 'subs'; this.loadSubs(); }

  loadSubs() {
    const p: any = {};
    if (this.subStatus) p.status = this.subStatus;
    if (this.subFormId) p.formId = this.subFormId;
    this.api.get<Submission[]>('/consents/submissions', p).subscribe({ next: (r) => (this.submissions = r || []), error: () => {} });
  }

  loadMy() {
    this.api.get<ConsentForm[]>('/consents/my-forms').subscribe({
      next: (r) => (this.myForms = (r || []).map((f) => ({
        ...f,
        submissions: (f.submissions || []).map((s: any) => ({ ...s, studentName: s.studentName })),
      }))),
      error: () => {},
    });
  }

  saveForm() {
    if (!this.form.title || !this.form.body) { this.flash('A title and the consent wording are required.', 'bad'); return; }
    this.api.post('/consents/forms', this.form).subscribe({
      next: () => {
        this.showForm = false; this.form = { type: 'general', requiresSignature: true, status: 'published' };
        this.tab = 'forms'; this.loadForms(); this.loadOverview(); this.flash('Form published.');
      },
      error: (e) => this.fail(e, 'Could not publish the form.'),
    });
  }

  archive(f: ConsentForm) {
    this.api.patch(`/consents/forms/${f.id}`, { status: f.status === 'published' ? 'archived' : 'published' }).subscribe({
      next: () => { this.loadForms(); this.loadOverview(); }, error: (e) => this.fail(e, 'Could not update the form.'),
    });
  }

  sign(f: ConsentForm, sub: any, decision: string) {
    if (decision === 'signed' && !this.signName.trim()) { this.flash('Type your full name to sign.', 'bad'); return; }
    this.api.post('/consents/sign', { formId: f.id, studentId: sub.studentId, decision, signatureName: this.signName }).subscribe({
      next: () => { this.signName = ''; this.loadMy(); this.flash(decision === 'signed' ? 'Thank you — consent recorded.' : 'Your response has been recorded.'); },
      error: (e) => this.fail(e, 'Could not record your response.'),
    });
  }
}
