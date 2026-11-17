import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface ConsentForm { id: string; title: string; type: string; body: string; status: string; dueDate?: string; requiresSignature: boolean; submissions?: any }
interface Submission { id: string; formId: string; studentId?: string; studentName?: string; parentName?: string; status: string; signatureName?: string; signedAt?: string; form?: ConsentForm }

const TYPES = ['trip', 'media', 'policy', 'medical', 'general'];

@Component({
  selector: 'app-admin-consents',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout [portalTitle]="isParent?'Parent Portal':'Admin Portal'" pageTitle="Consent Forms" [navSections]="isParent?[]:adminNav" [navItems]="isParent?parentNav:[]">
<div class="card">
  @if (isParent) {
    <h3>Forms awaiting your signature</h3>
    @for (f of myForms; track f.id) {
      <div class="card" style="margin-bottom:.75rem">
        <b>{{ f.title }}</b> <span class="badge">{{ f.type }}</span>
        @if (f.dueDate) { <span class="badge">Due {{ f.dueDate }}</span> }
        <div style="white-space:pre-wrap;margin:.5rem 0;color:#333">{{ f.body }}</div>
        @for (sub of f.submissions || []; track sub.studentId) {
          <div class="toolbar" style="margin-top:.5rem">
            <span>{{ sub.studentName || 'Child' }}: <b>{{ sub.status }}</b></span>
            @if (sub.status === 'pending') {
              <input [(ngModel)]="signName" placeholder="Type full name to sign" />
              <button class="btn-primary" (click)="sign(f, sub, 'signed')">Sign</button>
              <button class="btn-outline" (click)="sign(f, sub, 'declined')">Decline</button>
            }
          </div>
        }
      </div>
    } @empty { <p>Nothing to sign right now.</p> }
  } @else {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="typeFilter" (change)="loadForms()"><option value="">All types</option>@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select>
      <button class="btn-primary" (click)="showForm=!showForm">+ New form</button>
      <button class="btn-outline" (click)="tab='subs'; loadSubs()">View submissions</button>
    </div>
    @if (showForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <input [(ngModel)]="form.title" placeholder="Title *" />
          <select [(ngModel)]="form.type">@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select>
          <input [(ngModel)]="form.dueDate" type="date" title="Due date" />
          <label><input type="checkbox" [(ngModel)]="form.requiresSignature" [checked]="true" /> Requires signature</label>
          <textarea [(ngModel)]="form.body" placeholder="Form text / consent wording" rows="4" style="grid-column:1/-1"></textarea>
        </div>
        <div class="toolbar" style="margin-top:.5rem"><button class="btn-primary" (click)="saveForm()">Publish</button><button class="btn-outline" (click)="showForm=false">Cancel</button></div>
      </div>
    }
    @if (tab==='forms') {
      <table class="data-table"><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Submissions</th><th>Due</th><th></th></tr></thead><tbody>
        @for (f of forms; track f.id) {
          <tr><td>{{ f.title }}</td><td>{{ f.type }}</td><td><span class="badge">{{ f.status }}</span></td>
            <td>{{ f.submissions?.signed || 0 }}/{{ f.submissions?.total || 0 }} signed</td><td>{{ f.dueDate || '—' }}</td>
            <td><button class="btn-outline" (click)="archive(f)">{{ f.status==='published'?'Archive':'Publish' }}</button></td></tr>
        } @empty { <tr><td colspan="6">No forms</td></tr> }
      </tbody></table>
    } @else {
      <table class="data-table"><thead><tr><th>Form</th><th>Parent</th><th>Student</th><th>Status</th><th>Signed</th><th>Signature</th></tr></thead><tbody>
        @for (s of submissions; track s.id) {
          <tr><td>{{ s.form?.title }}</td><td>{{ s.parentName }}</td><td>{{ s.studentName || '—' }}</td>
            <td><span class="badge">{{ s.status }}</span></td><td>{{ s.signedAt | date:'medium' }}</td><td>{{ s.signatureName || '—' }}</td></tr>
        } @empty { <tr><td colspan="6">No submissions</td></tr> }
      </tbody></table>
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
  tab = 'forms';
  forms: ConsentForm[] = [];
  myForms: ConsentForm[] = [];
  submissions: Submission[] = [];
  showForm = false; typeFilter = ''; signName = '';
  form: any = { type: 'general', requiresSignature: true, status: 'published' };

  ngOnInit() { this.isParent ? this.loadMy() : this.loadForms(); }

  loadForms() {
    const p: any = {};
    if (this.typeFilter) p.type = this.typeFilter;
    this.api.get<ConsentForm[]>('/consents/forms', p).subscribe({ next: (r) => (this.forms = r || []), error: () => {} });
  }

  loadSubs() {
    this.api.get<Submission[]>('/consents/submissions').subscribe({ next: (r) => (this.submissions = r || []), error: () => {} });
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
    if (!this.form.title || !this.form.body) return;
    this.api.post('/consents/forms', this.form).subscribe({
      next: () => { this.showForm = false; this.form = { type: 'general', requiresSignature: true, status: 'published' }; this.loadForms(); },
      error: () => {},
    });
  }

  archive(f: ConsentForm) {
    this.api.patch(`/consents/forms/${f.id}`, { status: f.status === 'published' ? 'archived' : 'published' }).subscribe({
      next: () => this.loadForms(), error: () => {},
    });
  }

  sign(f: ConsentForm, sub: any, decision: string) {
    this.api.post('/consents/sign', { formId: f.id, studentId: sub.studentId, decision, signatureName: this.signName }).subscribe({
      next: () => { this.signName = ''; this.loadMy(); }, error: () => {},
    });
  }
}
