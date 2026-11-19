import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Visitor { id: string; visitorName: string; idNumber?: string; phone?: string; organization?: string; purpose?: string; personVisited?: string; signInTime?: string; signOutTime?: string; badgeNumber?: string; status: string }
interface Pickup { id: string; studentId: string; studentName?: string; name: string; relationship: string; phone?: string; idNumber?: string; validFrom?: string; validTo?: string; isActive: boolean }
interface EarlyLeave { id: string; studentId: string; studentName?: string; reason?: string; date: string; time: string; status: string; decisionNote?: string }
interface Student { id: string; firstName: string; lastName: string }

const TABS = [
  { key: 'visitors', label: 'Visitor Log' },
  { key: 'pickups', label: 'Authorised Pickups' },
  { key: 'earlyleave', label: 'Early Leave' },
];

@Component({
  selector: 'app-admin-gate',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Gate & Visitors" [navSections]="adminNav">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    @for (t of tabs; track t.key) {
      <button class="btn-outline" [style.fontWeight]="tab()===t.key?'700':'400'" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (tab() === 'visitors') {
    <div class="toolbar" style="margin-bottom:1rem">
      <input type="date" [(ngModel)]="visitorDate" (change)="loadVisitors()" />
      <input class="has-search-icon" [(ngModel)]="visitorSearch" placeholder="Search…" (keyup.enter)="loadVisitors()" />
      <button class="btn-primary" (click)="showVisitorForm=!showVisitorForm">+ Sign in</button>
    </div>
    @if (showVisitorForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <input [(ngModel)]="visitor.visitorName" placeholder="Visitor name *" /><input [(ngModel)]="visitor.idNumber" placeholder="ID number" />
          <input [(ngModel)]="visitor.phone" placeholder="Phone" /><input [(ngModel)]="visitor.organization" placeholder="Organization" />
          <input [(ngModel)]="visitor.personVisited" placeholder="Person visited" /><input [(ngModel)]="visitor.vehicleRegistration" placeholder="Vehicle reg" />
          <input [(ngModel)]="visitor.purpose" placeholder="Purpose" />
        </div>
        <div class="toolbar" style="margin-top:.5rem"><button class="btn-primary" (click)="signIn()">Sign in</button><button class="btn-outline" (click)="showVisitorForm=false">Cancel</button></div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Time in</th><th>Name</th><th>ID</th><th>Purpose</th><th>Person</th><th>Badge</th><th>Status</th><th></th></tr></thead><tbody>
      @for (v of visitors; track v.id) {
        <tr><td>{{ v.signInTime }}</td><td>{{ v.visitorName }}</td><td>{{ v.idNumber || '—' }}</td><td>{{ v.purpose || '—' }}</td>
          <td>{{ v.personVisited || '—' }}</td><td>{{ v.badgeNumber }}</td><td>{{ v.status }}</td>
          <td>@if (v.status==='inside') { <button class="btn-outline" (click)="signOut(v)">Sign out</button> }</td></tr>
      } @empty { <tr><td colspan="8">No visitors today</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'pickups') {
    <div class="toolbar" style="margin-bottom:1rem"><button class="btn-primary" (click)="showPickupForm=!showPickupForm">+ Authorise pickup</button></div>
    @if (showPickupForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="pickup.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
          <input [(ngModel)]="pickup.name" placeholder="Pickup person name *" /><input [(ngModel)]="pickup.relationship" placeholder="Relationship *" />
          <input [(ngModel)]="pickup.phone" placeholder="Phone" /><input [(ngModel)]="pickup.idNumber" placeholder="ID number" />
          <input [(ngModel)]="pickup.validFrom" type="date" title="Valid from" /><input [(ngModel)]="pickup.validTo" type="date" title="Valid to" />
        </div>
        <div class="toolbar" style="margin-top:.5rem"><button class="btn-primary" (click)="savePickup()">Save</button><button class="btn-outline" (click)="showPickupForm=false">Cancel</button></div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Student</th><th>Name</th><th>Relationship</th><th>Phone</th><th>Valid</th><th>Active</th><th></th></tr></thead><tbody>
      @for (p of pickups; track p.id) {
        <tr><td>{{ p.studentName }}</td><td>{{ p.name }}</td><td>{{ p.relationship }}</td><td>{{ p.phone || '—' }}</td>
          <td>{{ p.validFrom || '—' }} → {{ p.validTo || '—' }}</td><td>{{ p.isActive ? 'Yes' : 'No' }}</td>
          <td><button class="btn-outline" (click)="togglePickup(p)">{{ p.isActive ? 'Revoke' : 'Restore' }}</button></td></tr>
      } @empty { <tr><td colspan="7">No authorised pickups</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'earlyleave') {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="elFilter" (change)="loadEarlyLeave()"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option></select>
    </div>
    <table class="data-table"><thead><tr><th>Date</th><th>Time</th><th>Student</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
      @for (e of earlyLeaves; track e.id) {
        <tr><td>{{ e.date }}</td><td>{{ e.time }}</td><td>{{ e.studentName }}</td><td>{{ e.reason || '—' }}</td>
          <td><span class="badge">{{ e.status }}</span></td>
          <td>
            @if (e.status==='pending') {
              <button class="btn-outline" (click)="reviewLeave(e,'approved')">Approve</button>
              <button class="btn-outline" (click)="reviewLeave(e,'rejected')">Reject</button>
            }
            @if (e.status==='approved') { <button class="btn-outline" (click)="reviewLeave(e,'completed')">Departed</button> }
          </td></tr>
      } @empty { <tr><td colspan="6">No requests</td></tr> }
    </tbody></table>
  }
</div>
</app-portal-layout>`,
})
export class AdminGateComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  tabs = TABS;
  tab = signal('visitors');

  visitors: Visitor[] = [];
  pickups: Pickup[] = [];
  earlyLeaves: EarlyLeave[] = [];
  students: Student[] = [];
  visitorDate = new Date().toISOString().slice(0, 10);
  visitorSearch = '';
  elFilter = '';
  showVisitorForm = false; showPickupForm = false;
  visitor: any = {}; pickup: any = {};

  ngOnInit() {
    this.loadVisitors(); this.loadPickups(); this.loadEarlyLeave();
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
  }

  loadVisitors() {
    const p: any = { date: this.visitorDate };
    if (this.visitorSearch) p.q = this.visitorSearch;
    this.api.get<Visitor[]>('/gate/visitors', p).subscribe({ next: (r) => (this.visitors = r || []), error: () => {} });
  }

  loadPickups() {
    this.api.get<Pickup[]>('/gate/pickups').subscribe({ next: (r) => (this.pickups = r || []), error: () => {} });
  }

  loadEarlyLeave() {
    const p: any = {};
    if (this.elFilter) p.status = this.elFilter;
    this.api.get<EarlyLeave[]>('/gate/early-leave', p).subscribe({ next: (r) => (this.earlyLeaves = r || []), error: () => {} });
  }

  signIn() {
    if (!this.visitor.visitorName) return;
    this.api.post('/gate/visitors', { ...this.visitor, date: this.visitorDate }).subscribe({
      next: () => { this.showVisitorForm = false; this.visitor = {}; this.loadVisitors(); }, error: () => {},
    });
  }

  signOut(v: Visitor) {
    this.api.patch(`/gate/visitors/${v.id}`, { signOut: true }).subscribe({ next: () => this.loadVisitors(), error: () => {} });
  }

  savePickup() {
    if (!this.pickup.studentId || !this.pickup.name || !this.pickup.relationship) return;
    this.api.post('/gate/pickups', this.pickup).subscribe({
      next: () => { this.showPickupForm = false; this.pickup = {}; this.loadPickups(); }, error: () => {},
    });
  }

  togglePickup(p: Pickup) {
    this.api.patch(`/gate/pickups/${p.id}`, { isActive: !p.isActive }).subscribe({ next: () => this.loadPickups(), error: () => {} });
  }

  reviewLeave(e: EarlyLeave, status: string) {
    this.api.patch(`/gate/early-leave/${e.id}`, { status }).subscribe({ next: () => this.loadEarlyLeave(), error: () => {} });
  }
}
