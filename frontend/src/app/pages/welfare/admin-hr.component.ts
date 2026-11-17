import { Component, OnInit, inject, signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Staff { id: string; employeeNumber: string; department?: string; user?: { firstName: string; lastName: string } }
interface Row { id: string; staffId: string; staffName?: string; [k: string]: any }

const TABS = [
  { key: 'contracts', label: 'Contracts' },
  { key: 'appraisals', label: 'Appraisals' },
  { key: 'development', label: 'Development' },
  { key: 'documents', label: 'Documents' },
  { key: 'jobs', label: 'Recruitment' },
];

@Component({
  selector: 'app-admin-hr',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, LowerCasePipe],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Staff HR" [navSections]="adminNav">
<div class="hr-page">

  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Human Resources</p>
      <h2>Staff HR</h2>
      <p class="hero-sub">Manage contracts, appraisals, professional development, staff documents and recruitment in one register.</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><span>Staff on file</span><strong>{{ staff.length }}</strong><small>Active staff records</small></div>
      <div class="kpi"><span>{{ currentLabel }}</span><strong>{{ rows.length }}</strong><small>Records in this section</small></div>
    </div>
  </section>

  <div class="shell">
    <div class="tab-bar" role="tablist">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab" [class.active]="tab()===t.key" [attr.aria-selected]="tab()===t.key" (click)="switchTab(t.key)">{{ t.label }}</button>
      }
    </div>

    <div class="tab-body">
      <div class="panel-head">
        <div><h3>{{ currentLabel }}</h3><p>{{ currentBlurb }}</p></div>
        <div class="actions"><button class="btn-primary" (click)="showForm=!showForm">+ New</button></div>
      </div>

      @if (showForm) {
        <div class="form-panel">
          <h4>New {{ currentLabel | lowercase }} record</h4>
          <div class="fields">
            <div class="field"><label>Staff</label><select [(ngModel)]="form.staffId"><option value="">Staff…</option>@for (s of staff; track s.id) { <option [value]="s.id">{{ s.user?.firstName }} {{ s.user?.lastName }} ({{ s.employeeNumber }})</option> }</select></div>
            @if (tab()==='contracts') {
              <div class="field"><label>Contract type</label><select [(ngModel)]="form.contractType"><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="part_time">Part-time</option><option value="casual">Casual</option><option value="probation">Probation</option></select></div>
              <div class="field"><label>Start date</label><input [(ngModel)]="form.startDate" type="date" /></div>
              <div class="field"><label>End date</label><input [(ngModel)]="form.endDate" type="date" title="End date" /></div>
              <div class="field"><label>Position</label><input [(ngModel)]="form.position" placeholder="Position" /></div>
              <div class="field"><label>Salary</label><input [(ngModel)]="form.salary" type="number" placeholder="0.00" /></div>
            }
            @if (tab()==='appraisals') {
              <div class="field"><label>Period</label><input [(ngModel)]="form.period" placeholder="Period e.g. 2026 T1" /></div>
              <div class="field"><label>Rating (1-5)</label><input [(ngModel)]="form.rating" type="number" placeholder="Rating 1-5" /></div>
              <div class="field"><label>Score</label><input [(ngModel)]="form.score" type="number" placeholder="Score" /></div>
              <div class="field"><label>Date</label><input [(ngModel)]="form.date" type="date" /></div>
              <div class="field"><label>Strengths</label><input [(ngModel)]="form.strengths" placeholder="Strengths" /></div>
              <div class="field"><label>Areas to improve</label><input [(ngModel)]="form.areasForImprovement" placeholder="Areas to improve" /></div>
            }
            @if (tab()==='development') {
              <div class="field"><label>Course *</label><input [(ngModel)]="form.course" placeholder="Course" /></div>
              <div class="field"><label>Provider</label><input [(ngModel)]="form.provider" placeholder="Provider" /></div>
              <div class="field"><label>Date</label><input [(ngModel)]="form.date" type="date" /></div>
              <div class="field"><label>Hours</label><input [(ngModel)]="form.hours" type="number" placeholder="Hours" /></div>
              <div class="field"><label>Cost</label><input [(ngModel)]="form.cost" type="number" placeholder="0.00" /></div>
            }
            @if (tab()==='documents') {
              <div class="field"><label>Document type</label><select [(ngModel)]="form.docType"><option value="qualification">Qualification</option><option value="license">License</option><option value="passport">Passport</option><option value="contract">Contract</option><option value="clearance">Clearance</option><option value="other">Other</option></select></div>
              <div class="field"><label>Title *</label><input [(ngModel)]="form.title" placeholder="Title" /></div>
              <div class="field"><label>Issue date</label><input [(ngModel)]="form.issueDate" type="date" title="Issue" /></div>
              <div class="field"><label>Expiry date</label><input [(ngModel)]="form.expiryDate" type="date" title="Expiry" /></div>
            }
            @if (tab()==='jobs') {
              <div class="field"><label>Job title *</label><input [(ngModel)]="form.title" placeholder="Job title" /></div>
              <div class="field"><label>Department</label><input [(ngModel)]="form.department" placeholder="Department" /></div>
              <div class="field"><label>Employment type</label><select [(ngModel)]="form.employmentType"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option></select></div>
              <div class="field"><label>Closing date</label><input [(ngModel)]="form.closingDate" type="date" title="Closing date" /></div>
              <div class="field wide"><label>Description</label><textarea [(ngModel)]="form.description" placeholder="Description" rows="3"></textarea></div>
            }
          </div>
          <div class="form-actions"><button class="btn-primary" (click)="save()">Save</button><button class="btn-outline" (click)="showForm=false">Cancel</button></div>
        </div>
      }

      @if (tab()==='jobs') {
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Title</th><th>Department</th><th>Type</th><th>Status</th><th>Closing</th><th class="num">Apps</th></tr></thead><tbody>
            @for (j of rows; track j.id) { <tr><td class="name-cell">{{ j.title }}</td><td [class.muted]="!j.department">{{ j.department||'—' }}</td><td><span class="pill cat">{{ (j.employmentType || '').replace('_', ' ') }}</span></td><td><span class="pill" [class]="'pill st-' + j.status">{{ j.status }}</span></td><td [class.muted]="!j.closingDate">{{ j.closingDate||'—' }}</td><td class="num">{{ j.applicationCount||0 }}</td></tr> }
            @empty { <tr><td colspan="6" class="empty-cell"><span class="empty-icon">✎</span><strong>No postings</strong><span>Use “+ New” to advertise a vacancy.</span></td></tr> }
          </tbody></table>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Staff</th><th>Details</th><th>Status/Period</th><th>Date</th></tr></thead><tbody>
            @for (r of rows; track r.id) {
              <tr>
                <td><div class="staff-cell"><span class="avatar">{{ initials(r) }}</span><span class="who"><strong>{{ staffLabel(r) }}</strong>@if (staffNumber(r)) { <small>{{ staffNumber(r) }}</small> }</span></div></td>
                <td>{{ detail(r) }}</td>
                <td>@if (r.status || r.period) { <span class="pill" [class]="'pill st-' + (r.status || '')">{{ r.status || r.period }}</span> } @else { <span class="muted">—</span> }</td>
                <td>{{ r.date || r.startDate || r.expiryDate || r.createdAt }}</td></tr>
            } @empty { <tr><td colspan="4" class="empty-cell"><span class="empty-icon">☰</span><strong>No records</strong><span>Nothing has been recorded in this section yet.</span></td></tr> }
          </tbody></table>
        </div>
      }

      @if (tab()==='documents') {
        <div class="expiry">
          <a href="#" class="expiry-link" (click)="loadExpiring($event)">View documents expiring within 30 days</a>
          @if (expiring.length) {
            <ul class="expiry-list">
              @for (d of expiring; track d.id) { <li>{{ d.staffName }} — {{ d.title }} expires {{ d.expiryDate }}</li> }
            </ul>
          }
        </div>
      }
    </div>
  </div>
</div>
</app-portal-layout>`,
  styleUrl: './admin-hr.component.scss',
})
export class AdminHrComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  tabs = TABS;
  tab = signal('contracts');
  staff: Staff[] = [];
  rows: any[] = [];
  expiring: any[] = [];
  showForm = false;
  form: any = {};

  ngOnInit() {
    this.api.get<Staff[]>('/admin/staff').subscribe({ next: (r) => (this.staff = r || []), error: () => {} });
    this.load();
  }

  // ── Presentation helpers (read-only; no behaviour change) ──
  get currentLabel(): string { return this.tabs.find((t) => t.key === this.tab())?.label || ''; }
  get currentBlurb(): string {
    return ({
      contracts: 'Employment contracts, positions and terms.',
      appraisals: 'Performance reviews and ratings by period.',
      development: 'Training courses and professional development.',
      documents: 'Qualifications, licences and other staff documents.',
      jobs: 'Open vacancies and applications received.',
    } as Record<string, string>)[this.tab()] || '';
  }
  private staffRecord(r: any): Staff | undefined { return this.staff.find((s) => s.id === r.staffId); }
  staffLabel(r: any): string {
    const s = this.staffRecord(r);
    const full = s?.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : '';
    return r.staffName || full || r.employeeNumber || '—';
  }
  staffNumber(r: any): string { return r.employeeNumber || this.staffRecord(r)?.employeeNumber || ''; }
  initials(r: any): string {
    const parts = this.staffLabel(r).split(/\s+/).filter(Boolean);
    return parts.length ? ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?';
  }

  switchTab(k: string) { this.tab.set(k); this.form = {}; this.showForm = false; this.load(); }

  endpoint() {
    return { contracts: '/hr/contracts', appraisals: '/hr/appraisals', development: '/hr/development', documents: '/hr/documents', jobs: '/hr/jobs' }[this.tab()] || '/hr/contracts';
  }

  load() {
    this.api.get<Row[]>(this.endpoint()).subscribe({ next: (r) => (this.rows = r || []), error: () => {} });
  }

  detail(r: any): string {
    switch (this.tab()) {
      case 'contracts': return `${r.contractType || ''} ${r.position ? '· ' + r.position : ''} ${r.salary ? '· ' + r.salary : ''}`;
      case 'appraisals': return `Rating ${r.rating ?? '—'} · ${r.strengths ? r.strengths.slice(0, 60) : ''}`;
      case 'development': return `${r.course || ''} ${r.provider ? '· ' + r.provider : ''} ${r.hours ? r.hours + 'h' : ''}`;
      case 'documents': return `${r.docType || ''} · ${r.title || ''}`;
      default: return '';
    }
  }

  save() {
    const body = this.tab() === 'jobs' ? this.form : { ...this.form, staffId: this.form.staffId };
    this.api.post(this.endpoint(), body).subscribe({ next: () => { this.showForm = false; this.form = {}; this.load(); }, error: () => {} });
  }

  loadExpiring(ev: Event) {
    ev.preventDefault();
    this.api.get<Row[]>('/hr/expiring', { days: '30' }).subscribe({ next: (r) => (this.expiring = r || []), error: () => {} });
  }
}
