import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Student { id: string; firstName: string; lastName: string; admissionNumber?: string }
interface Incident {
  id: string; studentId: string; studentName?: string; date: string; kind: string;
  category: string; description: string; points: number; sanctionType: string;
  sanctionDetails?: string; status: string; parentNotified: boolean;
}
interface HealthProfile {
  id: string; studentId: string; studentName?: string; bloodGroup?: string;
  allergies?: string; chronicConditions?: string; currentMedications?: string;
  doctorName?: string; doctorPhone?: string;
}
interface SickbayVisit {
  id: string; studentId: string; studentName?: string; date: string; time?: string;
  symptoms?: string; diagnosis?: string; treatment?: string; medicationGiven?: string;
  sentHome: boolean; parentNotified: boolean;
}
interface Immunisation { id: string; studentId: string; vaccine: string; dateGiven: string; nextDueDate?: string }
interface EmergencyContact { id: string; studentId: string; name: string; relationship: string; phone: string; priority: number }
interface DisciplineOverview { total: number; merits: number; demerits: number; incidents: number; activeSanctions: number; awaitingParentNotice: number }
interface HealthOverview { profiles: number; withAllergies: number; visitsThisMonth: number; sentHomeThisMonth: number; parentNoticePending: number; immunisationsDueSoon: number }

const TABS = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'health', label: 'Health & Medical' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-admin-welfare',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout [portalTitle]="portalTitle" pageTitle="Student Welfare" [navSections]="navSections" [navItems]="navItems">

<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">Student welfare</p>
    <h2 class="wf-title">Discipline &amp; Health</h2>
    <p class="wf-sub">Merits, demerits and incidents alongside medical profiles, sickbay visits, immunisations and emergency contacts.</p>
  </div>
  <div class="wf-stats">
    @if (tab() === 'discipline') {
      <div class="wf-stat"><strong>{{ discOv()?.total ?? incidents.length }}</strong><span>Records</span></div>
      <div class="wf-stat"><strong>{{ discOv()?.merits ?? 0 }}</strong><span>Merits</span></div>
      <div class="wf-stat"><strong>{{ discOv()?.demerits ?? 0 }}</strong><span>Demerits</span></div>
      <div class="wf-stat"><strong>{{ discOv()?.activeSanctions ?? 0 }}</strong><span>Active sanctions</span></div>
    } @else {
      <div class="wf-stat"><strong>{{ hlthOv()?.profiles ?? 0 }}</strong><span>Health profiles</span></div>
      <div class="wf-stat"><strong>{{ hlthOv()?.visitsThisMonth ?? sickbay.length }}</strong><span>Sickbay this month</span></div>
      <div class="wf-stat"><strong>{{ hlthOv()?.withAllergies ?? 0 }}</strong><span>With allergies</span></div>
      <div class="wf-stat"><strong>{{ hlthOv()?.immunisationsDueSoon ?? 0 }}</strong><span>Vaccines due (30 d)</span></div>
    }
  </div>
</header>

<div class="card">
  <div class="tab-bar" role="tablist">
    @for (t of tabs; track t.key) {
      <button type="button" role="tab" [class.active]="tab()===t.key" [attr.aria-selected]="tab()===t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (notice(); as n) {
    <div class="wf-notice" [class.ok]="n.kind==='ok'" [class.bad]="n.kind==='bad'" role="status">{{ n.text }}</div>
  }

  <!-- ───────────────────────── Discipline ───────────────────────── -->
  @if (tab() === 'discipline') {
    <div class="wf-bar">
      <label class="wf-field"><span>Student</span>
        <select [(ngModel)]="incFilter.studentId" (change)="loadIncidents()"><option value="">All students</option>
          @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
        </select>
      </label>
      <label class="wf-field"><span>Kind</span>
        <select [(ngModel)]="incFilter.kind" (change)="loadIncidents()"><option value="">All kinds</option>
          <option value="merit">Merits</option><option value="demerit">Demerits</option><option value="incident">Incidents</option>
        </select>
      </label>
      <span class="wf-spacer"></span>
      @if (canEdit) { <button type="button" class="btn-primary" (click)="showIncForm=!showIncForm">+ Record</button> }
    </div>

    @if (showIncForm && canEdit) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">New discipline record</h4>
        <label class="wf-field"><span>Student</span>
          <select [(ngModel)]="inc.studentId"><option value="">Select student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
        </label>
        <label class="wf-field"><span>Kind</span>
          <select [(ngModel)]="inc.kind"><option value="incident">Incident</option><option value="merit">Merit</option><option value="demerit">Demerit</option></select>
        </label>
        <label class="wf-field"><span>Date</span><input [(ngModel)]="inc.date" type="date" /></label>
        <label class="wf-field"><span>Category</span><input [(ngModel)]="inc.category" placeholder="e.g. Punctuality" /></label>
        <label class="wf-field"><span>Points (+/−)</span><input [(ngModel)]="inc.points" type="number" placeholder="0" /></label>
        <label class="wf-field"><span>Sanction</span>
          <select [(ngModel)]="inc.sanctionType"><option value="none">No sanction</option><option value="warning">Warning</option><option value="detention">Detention</option><option value="suspension">Suspension</option><option value="community_service">Community service</option></select>
        </label>
        <label class="wf-field"><span>Sanction details</span><input [(ngModel)]="inc.sanctionDetails" placeholder="Optional" /></label>
        <label class="wf-field"><span>Sanction ends</span><input [(ngModel)]="inc.sanctionEndDate" type="date" /></label>
        <label class="wf-field wide"><span>Description</span><textarea [(ngModel)]="inc.description" placeholder="What happened, and any context worth keeping" rows="2"></textarea></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveIncident()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save record' }}</button>
          <button type="button" class="btn-outline" (click)="showIncForm=false">Cancel</button>
        </div>
      </div>
    }

    <div class="table-scroll"><table class="data-table wf-table">
      <thead><tr><th>Date</th><th>Student</th><th>Kind</th><th>Category</th><th>Description</th><th class="num">Pts</th><th>Sanction</th><th>Status</th><th>Parent</th>@if (canEdit) { <th></th> }</tr></thead>
      <tbody>
        @for (r of incidents; track r.id) {
          <tr>
            <td>{{ r.date | date:'d MMM y' }}</td>
            <td><div class="wf-person"><span class="wf-disc">{{ initials(r.studentName) }}</span><span class="wf-person-name">{{ r.studentName }}</span></div></td>
            <td><span class="wf-pill" [class.ok]="r.kind==='merit'" [class.bad]="r.kind==='demerit'" [class.warn]="r.kind==='incident'">{{ r.kind }}</span></td>
            <td>{{ r.category }}</td>
            <td><div class="wf-clip" [title]="r.description">{{ r.description }}</div></td>
            <td class="num"><span class="wf-pts" [class.pos]="r.points>0" [class.neg]="r.points<0">{{ r.points > 0 ? '+' : '' }}{{ r.points }}</span></td>
            <td>
              @if (r.sanctionType && r.sanctionType !== 'none') {
                <span class="wf-pill info">{{ label(r.sanctionType) }}</span>
                @if (r.sanctionDetails) { <div class="wf-meta">{{ r.sanctionDetails }}</div> }
              } @else { <span class="wf-muted">—</span> }
            </td>
            <td><span class="wf-pill" [class.ok]="r.status==='resolved' || r.status==='closed'" [class.warn]="r.status==='open'" [class.muted]="r.status!=='open' && r.status!=='resolved' && r.status!=='closed'">{{ r.status }}</span></td>
            <td>@if (r.parentNotified) { <span class="wf-tick" title="Parent notified">✓</span> } @else { <span class="wf-tick off" title="Not yet notified">—</span> }</td>
            @if (canEdit) {
              <td><div class="wf-row-actions"><button type="button" class="btn-outline" (click)="notifyParent(r)" [disabled]="r.parentNotified">Notify</button></div></td>
            }
          </tr>
        } @empty {
          <tr class="wf-empty-row"><td [attr.colspan]="canEdit ? 10 : 9"><div class="wf-empty-inline"><strong>No records</strong><span>Merits, demerits and incidents will appear here once recorded.</span></div></td></tr>
        }
      </tbody>
    </table></div>
  }

  <!-- ───────────────────────── Health & Medical ───────────────────────── -->
  @if (tab() === 'health') {
    <div class="wf-bar">
      <label class="wf-field"><span>Student record</span>
        <select [(ngModel)]="healthStudentId" (change)="loadHealth()"><option value="">Select student…</option>
          @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
        </select>
      </label>
      <span class="wf-spacer"></span>
      @if (canEdit) {
        <div class="wf-group">
          @if (healthStudentId) { <button type="button" class="btn-outline" (click)="showHealthForm=!showHealthForm">Edit profile</button> }
          <button type="button" class="btn-outline" (click)="showSickForm=!showSickForm">+ Sickbay visit</button>
          <button type="button" class="btn-outline" (click)="showImmunForm=!showImmunForm">+ Immunisation</button>
          <button type="button" class="btn-outline" (click)="showContactForm=!showContactForm">+ Emergency contact</button>
          <button type="button" class="btn-outline btn-warn-outline" (click)="showAlertForm=!showAlertForm">Alert parents</button>
        </div>
      }
    </div>

    @if (showHealthForm && healthStudentId && canEdit) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">Health profile</h4>
        <label class="wf-field"><span>Blood group</span><input [(ngModel)]="health.bloodGroup" placeholder="e.g. O+" /></label>
        <label class="wf-field"><span>Doctor</span><input [(ngModel)]="health.doctorName" /></label>
        <label class="wf-field"><span>Doctor phone</span><input [(ngModel)]="health.doctorPhone" /></label>
        <label class="wf-field"><span>Allergies</span><input [(ngModel)]="health.allergies" /></label>
        <label class="wf-field"><span>Chronic conditions</span><input [(ngModel)]="health.chronicConditions" /></label>
        <label class="wf-field"><span>Current medication</span><input [(ngModel)]="health.currentMedications" /></label>
        <label class="wf-field wide"><span>Notes</span><textarea [(ngModel)]="health.notes" rows="2"></textarea></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveHealth()">Save profile</button>
          <button type="button" class="btn-outline" (click)="showHealthForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showSickForm && canEdit) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">Sickbay visit</h4>
        <label class="wf-field"><span>Student</span>
          <select [(ngModel)]="sick.studentId"><option value="">Select student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
        </label>
        <label class="wf-field"><span>Date</span><input [(ngModel)]="sick.date" type="date" /></label>
        <label class="wf-field"><span>Time</span><input [(ngModel)]="sick.time" type="time" /></label>
        <label class="wf-field"><span>Symptoms</span><input [(ngModel)]="sick.symptoms" /></label>
        <label class="wf-field"><span>Diagnosis</span><input [(ngModel)]="sick.diagnosis" /></label>
        <label class="wf-field"><span>Treatment</span><input [(ngModel)]="sick.treatment" /></label>
        <label class="wf-field"><span>Medication given</span><input [(ngModel)]="sick.medicationGiven" /></label>
        <label class="wf-check"><input type="checkbox" [(ngModel)]="sick.sentHome" /> Sent home</label>
        <label class="wf-check"><input type="checkbox" [(ngModel)]="sick.notifyParent" /> Notify parent</label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveSickbay()">Save visit</button>
          <button type="button" class="btn-outline" (click)="showSickForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showImmunForm && canEdit) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">Immunisation</h4>
        <label class="wf-field"><span>Student</span>
          <select [(ngModel)]="immun.studentId"><option value="">Select student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
        </label>
        <label class="wf-field"><span>Vaccine</span><input [(ngModel)]="immun.vaccine" /></label>
        <label class="wf-field"><span>Date given</span><input [(ngModel)]="immun.dateGiven" type="date" /></label>
        <label class="wf-field"><span>Next due</span><input [(ngModel)]="immun.nextDueDate" type="date" /></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveImmunisation()">Save</button>
          <button type="button" class="btn-outline" (click)="showImmunForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showContactForm && canEdit) {
      <div class="wf-form form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">Emergency contact</h4>
        <label class="wf-field"><span>Student</span>
          <select [(ngModel)]="contact.studentId"><option value="">Select student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
        </label>
        <label class="wf-field"><span>Name</span><input [(ngModel)]="contact.name" /></label>
        <label class="wf-field"><span>Relationship</span><input [(ngModel)]="contact.relationship" /></label>
        <label class="wf-field"><span>Phone</span><input [(ngModel)]="contact.phone" /></label>
        <label class="wf-field"><span>Email</span><input [(ngModel)]="contact.email" /></label>
        <label class="wf-field"><span>Priority</span><input [(ngModel)]="contact.priority" type="number" /></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary" (click)="saveContact()">Save</button>
          <button type="button" class="btn-outline" (click)="showContactForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showAlertForm && canEdit) {
      <div class="wf-form danger form-grid">
        <h4 class="wf-form-title" style="grid-column:1/-1">Alert parents</h4>
        <label class="wf-field"><span>Student</span>
          <select [(ngModel)]="alert.studentId"><option value="">Select student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
        </label>
        <label class="wf-field"><span>Alert title</span><input [(ngModel)]="alert.title" /></label>
        <label class="wf-field wide"><span>Message to parents</span><textarea [(ngModel)]="alert.message" rows="2"></textarea></label>
        <div class="wf-actions" style="grid-column:1/-1">
          <button type="button" class="btn-primary btn-danger-solid" (click)="sendAlert()">Send alert</button>
          <button type="button" class="btn-outline" (click)="showAlertForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (healthStudentId) {
      <div class="wf-section"><h3>Health profile</h3>@if (profile; as p) { <small>{{ p.studentName }}</small> }</div>
      @if (profile; as p) {
        <div class="wf-detail">
          <div><span class="wf-detail-k">Blood group</span><span class="wf-detail-v" [class.none]="!p.bloodGroup">{{ p.bloodGroup || 'Not recorded' }}</span></div>
          <div><span class="wf-detail-k">Allergies</span><span class="wf-detail-v" [class.flag]="!!p.allergies" [class.none]="!p.allergies">{{ p.allergies || 'None recorded' }}</span></div>
          <div><span class="wf-detail-k">Chronic conditions</span><span class="wf-detail-v" [class.none]="!p.chronicConditions">{{ p.chronicConditions || 'None recorded' }}</span></div>
          <div><span class="wf-detail-k">Medication</span><span class="wf-detail-v" [class.none]="!p.currentMedications">{{ p.currentMedications || 'None recorded' }}</span></div>
          <div><span class="wf-detail-k">Doctor</span><span class="wf-detail-v" [class.none]="!p.doctorName">{{ p.doctorName || 'Not recorded' }}{{ p.doctorPhone ? ' · ' + p.doctorPhone : '' }}</span></div>
        </div>
      } @else {
        <div class="wf-empty"><strong>No health profile on file</strong><span>@if (canEdit) { Use “Edit profile” to create one for this student. } @else { Nothing has been recorded for this student yet. }</span></div>
      }

      <div class="wf-split">
        <div>
          <div class="wf-section"><h3>Emergency contacts</h3><small>{{ emergencyContacts.length }}</small></div>
          <div class="table-scroll"><table class="data-table wf-table">
            <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th class="num">Priority</th>@if (canEdit) { <th></th> }</tr></thead>
            <tbody>
              @for (c of emergencyContacts; track c.id) {
                <tr><td class="wf-strong">{{ c.name }}</td><td>{{ c.relationship }}</td><td>{{ c.phone }}</td><td class="num">{{ c.priority }}</td>
                  @if (canEdit) { <td><div class="wf-row-actions"><button type="button" class="btn-outline" (click)="delContact(c)">Delete</button></div></td> }</tr>
              } @empty { <tr class="wf-empty-row"><td [attr.colspan]="canEdit ? 5 : 4">No emergency contacts</td></tr> }
            </tbody>
          </table></div>
        </div>
        <div>
          <div class="wf-section"><h3>Immunisations</h3><small>{{ immunisations.length }}</small></div>
          <div class="table-scroll"><table class="data-table wf-table">
            <thead><tr><th>Vaccine</th><th>Given</th><th>Next due</th>@if (canEdit) { <th></th> }</tr></thead>
            <tbody>
              @for (i of immunisations; track i.id) {
                <tr><td class="wf-strong">{{ i.vaccine }}</td><td>{{ i.dateGiven | date:'d MMM y' }}</td>
                  <td>@if (i.nextDueDate) { {{ i.nextDueDate | date:'d MMM y' }} } @else { <span class="wf-muted">—</span> }</td>
                  @if (canEdit) { <td><div class="wf-row-actions"><button type="button" class="btn-outline" (click)="delImmunisation(i)">Delete</button></div></td> }</tr>
              } @empty { <tr class="wf-empty-row"><td [attr.colspan]="canEdit ? 4 : 3">No immunisations recorded</td></tr> }
            </tbody>
          </table></div>
        </div>
      </div>
    }

    <div class="wf-section"><h3>Recent sickbay visits</h3><small>{{ sickbay.length }} shown</small></div>
    <div class="table-scroll"><table class="data-table wf-table">
      <thead><tr><th>Date</th><th>Student</th><th>Symptoms</th><th>Diagnosis</th><th>Treatment</th><th>Sent home</th><th>Parent</th>@if (canEdit) { <th></th> }</tr></thead>
      <tbody>
        @for (v of sickbay; track v.id) {
          <tr>
            <td>{{ v.date | date:'d MMM y' }}@if (v.time) { <div class="wf-meta">{{ v.time }}</div> }</td>
            <td><div class="wf-person"><span class="wf-disc">{{ initials(v.studentName) }}</span><span class="wf-person-name">{{ v.studentName }}</span></div></td>
            <td>{{ v.symptoms || '—' }}</td>
            <td>{{ v.diagnosis || '—' }}</td>
            <td>{{ v.treatment || '—' }}@if (v.medicationGiven) { <div class="wf-meta">{{ v.medicationGiven }}</div> }</td>
            <td><span class="wf-pill" [class.warn]="v.sentHome" [class.muted]="!v.sentHome">{{ v.sentHome ? 'Yes' : 'No' }}</span></td>
            <td>@if (v.parentNotified) { <span class="wf-tick" title="Parent notified">✓</span> } @else { <span class="wf-tick off">—</span> }</td>
            @if (canEdit) { <td><div class="wf-row-actions"><button type="button" class="btn-outline" (click)="notifySickbay(v)" [disabled]="v.parentNotified">Notify</button></div></td> }
          </tr>
        } @empty {
          <tr class="wf-empty-row"><td [attr.colspan]="canEdit ? 8 : 7"><div class="wf-empty-inline"><strong>No visits</strong><span>Sickbay visits will be listed here.</span></div></td></tr>
        }
      </tbody>
    </table></div>
  }
</div>
</app-portal-layout>`,
})
export class AdminWelfareComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;
  readonly tabs = TABS;
  tab = signal('discipline');

  get isParent() { return this.auth.user()?.role === 'parent'; }
  get isTeacher() { return this.auth.user()?.role === 'teacher'; }
  /** Parents have read-only access to their children's records. */
  get canEdit() { return !this.isParent; }
  get portalTitle() { return this.isParent ? 'Parent Portal' : this.isTeacher ? 'Teacher Portal' : 'Admin Portal'; }
  get navSections() { return this.isParent ? [] : this.isTeacher ? this.teacherNav : this.adminNav; }
  get navItems() { return this.isParent ? this.parentNav : []; }

  students: Student[] = [];
  incidents: Incident[] = [];
  sickbay: SickbayVisit[] = [];
  profile: HealthProfile | null = null;
  immunisations: Immunisation[] = [];
  emergencyContacts: EmergencyContact[] = [];
  saving = signal(false);
  discOv = signal<DisciplineOverview | null>(null);
  hlthOv = signal<HealthOverview | null>(null);
  notice = signal<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  private noticeTimer: any;

  incFilter = { studentId: '', kind: '' };
  showIncForm = false;
  inc: any = this.blankIncident();

  healthStudentId = '';
  showHealthForm = false; showSickForm = false; showImmunForm = false; showContactForm = false; showAlertForm = false;
  health: any = {};
  sick: any = this.blankSick();
  immun: any = { dateGiven: todayIso() };
  contact: any = { priority: 1 };
  alert: any = { title: 'School alert' };

  ngOnInit() {
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
    this.loadIncidents();
    this.loadSickbay();
    this.loadOverviews();
  }

  private blankIncident() { return { kind: 'incident', sanctionType: 'none', points: 0, date: todayIso() }; }
  private blankSick() { return { sentHome: false, notifyParent: true, date: todayIso() }; }

  initials(name?: string) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '·';
  }

  label(v: string) { return (v || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }

  private flash(text: string, kind: 'ok' | 'bad' = 'ok') {
    clearTimeout(this.noticeTimer);
    this.notice.set({ kind, text });
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4500);
  }

  private fail(e: any, fallback: string) { this.flash(e?.error?.message || fallback, 'bad'); }

  loadOverviews() {
    this.api.get<DisciplineOverview>('/discipline/overview').subscribe({ next: (r) => this.discOv.set(r), error: () => {} });
    this.api.get<HealthOverview>('/health/overview').subscribe({ next: (r) => this.hlthOv.set(r), error: () => {} });
  }

  loadIncidents() {
    const p: any = {};
    if (this.incFilter.studentId) p.studentId = this.incFilter.studentId;
    if (this.incFilter.kind) p.kind = this.incFilter.kind;
    this.api.get<Incident[]>('/discipline', p).subscribe({ next: (r) => (this.incidents = r || []), error: () => {} });
  }

  loadSickbay() {
    this.api.get<SickbayVisit[]>('/health/sickbay', { limit: '100' }).subscribe({ next: (r) => (this.sickbay = r || []), error: () => {} });
  }

  loadHealth() {
    if (!this.healthStudentId) {
      this.profile = null; this.health = {}; this.immunisations = []; this.emergencyContacts = [];
      return;
    }
    this.api.get<any>(`/health/profiles/${this.healthStudentId}`).subscribe({
      next: (r) => {
        this.profile = r.profile;
        this.health = { ...(r.profile || {}) };
        this.immunisations = r.immunisations || [];
        this.emergencyContacts = r.emergencyContacts || [];
      },
      error: (e) => this.fail(e, 'Could not load this student’s health record.'),
    });
  }

  saveIncident() {
    if (!this.inc.studentId || !this.inc.category || !this.inc.description) {
      this.flash('Choose a student and add a category and description.', 'bad');
      return;
    }
    this.saving.set(true);
    this.api.post('/discipline', this.inc).subscribe({
      next: () => {
        this.saving.set(false); this.showIncForm = false; this.inc = this.blankIncident();
        this.loadIncidents(); this.loadOverviews(); this.flash('Record saved.');
      },
      error: (e) => { this.saving.set(false); this.fail(e, 'Could not save the record.'); },
    });
  }

  notifyParent(r: Incident) {
    this.api.post(`/discipline/${r.id}/notify-parent`, {}).subscribe({
      next: () => { this.loadIncidents(); this.loadOverviews(); this.flash('Parent notified.'); },
      error: (e) => this.fail(e, 'Could not notify the parent.'),
    });
  }

  saveHealth() {
    this.api.put(`/health/profiles/${this.healthStudentId}`, this.health).subscribe({
      next: () => { this.showHealthForm = false; this.loadHealth(); this.loadOverviews(); this.flash('Health profile saved.'); },
      error: (e) => this.fail(e, 'Could not save the profile.'),
    });
  }

  saveSickbay() {
    if (!this.sick.studentId) { this.flash('Choose a student for the visit.', 'bad'); return; }
    this.api.post('/health/sickbay', this.sick).subscribe({
      next: () => { this.showSickForm = false; this.sick = this.blankSick(); this.loadSickbay(); this.loadOverviews(); this.flash('Sickbay visit saved.'); },
      error: (e) => this.fail(e, 'Could not save the visit.'),
    });
  }

  notifySickbay(v: SickbayVisit) {
    this.api.post(`/health/sickbay/${v.id}/notify-parent`, {}).subscribe({
      next: () => { this.loadSickbay(); this.loadOverviews(); this.flash('Parent notified.'); },
      error: (e) => this.fail(e, 'Could not notify the parent.'),
    });
  }

  saveImmunisation() {
    if (!this.immun.studentId || !this.immun.vaccine) { this.flash('Choose a student and enter the vaccine.', 'bad'); return; }
    this.api.post('/health/immunisations', this.immun).subscribe({
      next: () => { this.showImmunForm = false; this.immun = { dateGiven: todayIso() }; this.loadHealth(); this.loadOverviews(); this.flash('Immunisation saved.'); },
      error: (e) => this.fail(e, 'Could not save the immunisation.'),
    });
  }

  delImmunisation(i: Immunisation) {
    this.api.delete(`/health/immunisations/${i.id}`).subscribe({
      next: () => { this.loadHealth(); this.loadOverviews(); },
      error: (e) => this.fail(e, 'Could not delete the immunisation.'),
    });
  }

  saveContact() {
    if (!this.contact.studentId || !this.contact.name) { this.flash('Choose a student and enter the contact’s name.', 'bad'); return; }
    this.api.post('/health/emergency-contacts', this.contact).subscribe({
      next: () => { this.showContactForm = false; this.contact = { priority: 1 }; this.loadHealth(); this.flash('Emergency contact saved.'); },
      error: (e) => this.fail(e, 'Could not save the contact.'),
    });
  }

  delContact(c: EmergencyContact) {
    this.api.delete(`/health/emergency-contacts/${c.id}`).subscribe({
      next: () => this.loadHealth(),
      error: (e) => this.fail(e, 'Could not delete the contact.'),
    });
  }

  sendAlert() {
    if (!this.alert.studentId || !this.alert.message) { this.flash('Choose a student and write a message.', 'bad'); return; }
    this.api.post('/health/alert', { studentIds: [this.alert.studentId], title: this.alert.title, message: this.alert.message }).subscribe({
      next: () => { this.showAlertForm = false; this.alert = { title: 'School alert' }; this.flash('Alert sent to parents.'); },
      error: (e) => this.fail(e, 'Could not send the alert.'),
    });
  }
}
