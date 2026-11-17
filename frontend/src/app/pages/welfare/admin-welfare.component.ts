import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

const TABS = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'health', label: 'Health & Medical' },
];

@Component({
  selector: 'app-admin-welfare',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout [portalTitle]="portalTitle" pageTitle="Student Welfare" [navSections]="navSections" [navItems]="navItems">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    @for (t of tabs; track t.key) {
      <button class="btn-outline" [style.fontWeight]="tab()===t.key?'700':'400'" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (tab() === 'discipline') {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="incFilter.studentId" (change)="loadIncidents()"><option value="">All students</option>
        @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
      </select>
      <select [(ngModel)]="incFilter.kind" (change)="loadIncidents()"><option value="">All kinds</option>
        <option value="merit">Merits</option><option value="demerit">Demerits</option><option value="incident">Incidents</option>
      </select>
      <button class="btn-primary" (click)="showIncForm=!showIncForm">+ Record</button>
    </div>

    @if (showIncForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="inc.studentId"><option value="">Student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
          <select [(ngModel)]="inc.kind"><option value="incident">Incident</option><option value="merit">Merit</option><option value="demerit">Demerit</option></select>
          <input [(ngModel)]="inc.date" type="date" />
          <input [(ngModel)]="inc.category" placeholder="Category (e.g. punctuality)" />
          <input [(ngModel)]="inc.points" type="number" placeholder="Points (+/-)" />
          <select [(ngModel)]="inc.sanctionType"><option value="none">No sanction</option><option value="warning">Warning</option><option value="detention">Detention</option><option value="suspension">Suspension</option><option value="community_service">Community service</option></select>
          <input [(ngModel)]="inc.sanctionDetails" placeholder="Sanction details" />
          <input [(ngModel)]="inc.sanctionEndDate" type="date" title="Sanction end date" />
          <textarea [(ngModel)]="inc.description" placeholder="Description" rows="2" style="grid-column:1/-1"></textarea>
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveIncident()" [disabled]="saving()">Save</button>
          <button class="btn-outline" (click)="showIncForm=false">Cancel</button>
        </div>
      </div>
    }

    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Date</th><th>Student</th><th>Kind</th><th>Category</th><th>Description</th><th>Pts</th><th>Sanction</th><th>Status</th><th>Parent</th><th></th></tr></thead>
      <tbody>
        @for (r of incidents; track r.id) {
          <tr>
            <td>{{ r.date }}</td><td>{{ r.studentName }}</td>
            <td><span class="badge" [class.text-green]="r.kind==='merit'" [class.text-red]="r.kind==='demerit'">{{ r.kind }}</span></td>
            <td>{{ r.category }}</td><td>{{ r.description }}</td><td>{{ r.points }}</td>
            <td>{{ r.sanctionType }}{{ r.sanctionDetails ? ' — ' + r.sanctionDetails : '' }}</td>
            <td>{{ r.status }}</td><td>{{ r.parentNotified ? '✓' : '—' }}</td>
            <td><button class="btn-outline" (click)="notifyParent(r)" [disabled]="r.parentNotified">Notify</button></td>
          </tr>
        } @empty { <tr><td colspan="10">No records</td></tr> }
      </tbody>
    </table></div>
  }

  @if (tab() === 'health') {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="healthStudentId"><option value="">Select student…</option>
        @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
      </select>
      <button class="btn-primary" (click)="loadHealth()" [disabled]="!healthStudentId">Load record</button>
      @if (healthStudentId) { <button class="btn-outline" (click)="showHealthForm=!showHealthForm">Edit profile</button> }
      <button class="btn-outline" (click)="showSickForm=!showSickForm">+ Sickbay visit</button>
      <button class="btn-outline" (click)="showImmunForm=!showImmunForm">+ Immunisation</button>
      <button class="btn-outline" (click)="showContactForm=!showContactForm">+ Emergency contact</button>
      <button class="btn-outline" (click)="showAlertForm=!showAlertForm" style="color:#b91c1c">⚠ Alert parents</button>
    </div>

    @if (showHealthForm && healthStudentId) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <input [(ngModel)]="health.bloodGroup" placeholder="Blood group" />
          <input [(ngModel)]="health.doctorName" placeholder="Doctor name" />
          <input [(ngModel)]="health.doctorPhone" placeholder="Doctor phone" />
          <input [(ngModel)]="health.allergies" placeholder="Allergies" />
          <input [(ngModel)]="health.chronicConditions" placeholder="Chronic conditions" />
          <input [(ngModel)]="health.currentMedications" placeholder="Current medication" />
          <textarea [(ngModel)]="health.notes" placeholder="Notes" rows="2" style="grid-column:1/-1"></textarea>
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveHealth()">Save profile</button>
          <button class="btn-outline" (click)="showHealthForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showSickForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="sick.studentId"><option value="">Student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
          <input [(ngModel)]="sick.date" type="date" /><input [(ngModel)]="sick.time" type="time" />
          <input [(ngModel)]="sick.symptoms" placeholder="Symptoms" />
          <input [(ngModel)]="sick.diagnosis" placeholder="Diagnosis" />
          <input [(ngModel)]="sick.treatment" placeholder="Treatment" />
          <input [(ngModel)]="sick.medicationGiven" placeholder="Medication given" />
          <label><input type="checkbox" [(ngModel)]="sick.sentHome" /> Sent home</label>
          <label><input type="checkbox" [(ngModel)]="sick.notifyParent" [checked]="true" /> Notify parent</label>
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveSickbay()">Save visit</button>
          <button class="btn-outline" (click)="showSickForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showImmunForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="immun.studentId"><option value="">Student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
          <input [(ngModel)]="immun.vaccine" placeholder="Vaccine" />
          <input [(ngModel)]="immun.dateGiven" type="date" />
          <input [(ngModel)]="immun.nextDueDate" type="date" title="Next due" />
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveImmunisation()">Save</button>
          <button class="btn-outline" (click)="showImmunForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showContactForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="contact.studentId"><option value="">Student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
          <input [(ngModel)]="contact.name" placeholder="Name" />
          <input [(ngModel)]="contact.relationship" placeholder="Relationship" />
          <input [(ngModel)]="contact.phone" placeholder="Phone" />
          <input [(ngModel)]="contact.email" placeholder="Email" />
          <input [(ngModel)]="contact.priority" type="number" placeholder="Priority" />
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveContact()">Save</button>
          <button class="btn-outline" (click)="showContactForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (showAlertForm) {
      <div class="card" style="margin-bottom:1rem;border:1px solid #fecaca">
        <div class="form-grid">
          <select [(ngModel)]="alert.studentId"><option value="">Student…</option>
            @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
          </select>
          <input [(ngModel)]="alert.title" placeholder="Alert title" />
          <textarea [(ngModel)]="alert.message" placeholder="Message to parents" rows="2" style="grid-column:1/-1"></textarea>
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" style="background:#b91c1c" (click)="sendAlert()">Send alert</button>
          <button class="btn-outline" (click)="showAlertForm=false">Cancel</button>
        </div>
      </div>
    }

    @if (healthStudentId) {
      <h3>Health profile</h3>
      @if (profile; as p) {
        <p><b>Blood:</b> {{ p.bloodGroup || '—' }} · <b>Allergies:</b> {{ p.allergies || 'None recorded' }} · <b>Conditions:</b> {{ p.chronicConditions || '—' }} · <b>Medication:</b> {{ p.currentMedications || '—' }} · <b>Doctor:</b> {{ p.doctorName || '—' }} {{ p.doctorPhone || '' }}</p>
      } @else { <p class="text-red">No health profile on file for this student.</p> }

      <h3 style="margin-top:1rem">Emergency contacts</h3>
      <table class="data-table"><thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Priority</th><th></th></tr></thead>
        <tbody>@for (c of emergencyContacts; track c.id) {
          <tr><td>{{ c.name }}</td><td>{{ c.relationship }}</td><td>{{ c.phone }}</td><td>{{ c.priority }}</td>
            <td><button class="btn-outline" (click)="delContact(c)">Delete</button></td></tr>
        } @empty { <tr><td colspan="5">None</td></tr> }</tbody></table>

      <h3 style="margin-top:1rem">Immunisations</h3>
      <table class="data-table"><thead><tr><th>Vaccine</th><th>Date</th><th>Next due</th><th></th></tr></thead>
        <tbody>@for (i of immunisations; track i.id) {
          <tr><td>{{ i.vaccine }}</td><td>{{ i.dateGiven }}</td><td>{{ i.nextDueDate || '—' }}</td>
            <td><button class="btn-outline" (click)="delImmunisation(i)">Delete</button></td></tr>
        } @empty { <tr><td colspan="4">None</td></tr> }</tbody></table>
    }

    <h3 style="margin-top:1rem">Recent sickbay visits</h3>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Date</th><th>Student</th><th>Symptoms</th><th>Diagnosis</th><th>Treatment</th><th>Sent home</th><th>Parent</th><th></th></tr></thead>
      <tbody>@for (v of sickbay; track v.id) {
        <tr><td>{{ v.date }} {{ v.time }}</td><td>{{ v.studentName }}</td><td>{{ v.symptoms }}</td>
          <td>{{ v.diagnosis }}</td><td>{{ v.treatment }}{{ v.medicationGiven ? ' / ' + v.medicationGiven : '' }}</td>
          <td>{{ v.sentHome ? 'Yes' : 'No' }}</td><td>{{ v.parentNotified ? '✓' : '—' }}</td>
          <td><button class="btn-outline" (click)="notifySickbay(v)" [disabled]="v.parentNotified">Notify</button></td></tr>
      } @empty { <tr><td colspan="8">No visits</td></tr> }</tbody>
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

  incFilter = { studentId: '', kind: '' };
  showIncForm = false;
  inc: any = { kind: 'incident', sanctionType: 'none', points: 0, date: new Date().toISOString().slice(0, 10) };

  healthStudentId = '';
  showHealthForm = false; showSickForm = false; showImmunForm = false; showContactForm = false; showAlertForm = false;
  health: any = {};
  sick: any = { sentHome: false, notifyParent: true, date: new Date().toISOString().slice(0, 10) };
  immun: any = { dateGiven: new Date().toISOString().slice(0, 10) };
  contact: any = { priority: 1 };
  alert: any = { title: 'School alert' };

  ngOnInit() {
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
    this.loadIncidents();
    this.loadSickbay();
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
    if (!this.healthStudentId) return;
    this.api.get<any>(`/health/profiles/${this.healthStudentId}`).subscribe({
      next: (r) => {
        this.profile = r.profile;
        this.health = { ...(r.profile || {}) };
        this.immunisations = r.immunisations || [];
        this.emergencyContacts = r.emergencyContacts || [];
      },
      error: () => {},
    });
  }

  saveIncident() {
    if (!this.inc.studentId || !this.inc.description) return;
    this.saving.set(true);
    this.api.post('/discipline', this.inc).subscribe({
      next: () => { this.saving.set(false); this.showIncForm = false; this.inc = { kind: 'incident', sanctionType: 'none', points: 0, date: new Date().toISOString().slice(0, 10) }; this.loadIncidents(); },
      error: () => this.saving.set(false),
    });
  }

  notifyParent(r: Incident) {
    this.api.post(`/discipline/${r.id}/notify-parent`, {}).subscribe({ next: () => this.loadIncidents(), error: () => {} });
  }

  saveHealth() {
    this.api.put(`/health/profiles/${this.healthStudentId}`, this.health).subscribe({
      next: () => { this.showHealthForm = false; this.loadHealth(); }, error: () => {},
    });
  }

  saveSickbay() {
    if (!this.sick.studentId) return;
    this.api.post('/health/sickbay', this.sick).subscribe({
      next: () => { this.showSickForm = false; this.sick = { sentHome: false, notifyParent: true, date: new Date().toISOString().slice(0, 10) }; this.loadSickbay(); },
      error: () => {},
    });
  }

  notifySickbay(v: SickbayVisit) {
    this.api.post(`/health/sickbay/${v.id}/notify-parent`, {}).subscribe({ next: () => this.loadSickbay(), error: () => {} });
  }

  saveImmunisation() {
    if (!this.immun.studentId || !this.immun.vaccine) return;
    this.api.post('/health/immunisations', this.immun).subscribe({
      next: () => { this.showImmunForm = false; this.immun = { dateGiven: new Date().toISOString().slice(0, 10) }; this.loadHealth(); }, error: () => {},
    });
  }

  delImmunisation(i: Immunisation) {
    this.api.delete(`/health/immunisations/${i.id}`).subscribe({ next: () => this.loadHealth(), error: () => {} });
  }

  saveContact() {
    if (!this.contact.studentId || !this.contact.name) return;
    this.api.post('/health/emergency-contacts', this.contact).subscribe({
      next: () => { this.showContactForm = false; this.contact = { priority: 1 }; this.loadHealth(); }, error: () => {},
    });
  }

  delContact(c: EmergencyContact) {
    this.api.delete(`/health/emergency-contacts/${c.id}`).subscribe({ next: () => this.loadHealth(), error: () => {} });
  }

  sendAlert() {
    if (!this.alert.studentId || !this.alert.message) return;
    this.api.post('/health/alert', { studentIds: [this.alert.studentId], title: this.alert.title, message: this.alert.message }).subscribe({
      next: () => { this.showAlertForm = false; this.alert = { title: 'School alert' }; }, error: () => {},
    });
  }
}
