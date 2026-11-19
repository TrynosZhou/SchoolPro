import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Route_ { id: string; code: string; name: string; isActive: boolean }
interface Stop { id: string; routeId: string; name: string; address?: string; pickupTime?: string; sequence: number }
interface Driver { id: string; name: string; phone?: string; licenseNumber?: string; licenseExpiry?: string; isActive: boolean }
interface Vehicle { id: string; registration: string; make: string; capacity?: number; routeId?: string; driverId?: string; driverName?: string; routeCode?: string; status: string }
interface Assignment { id: string; studentId: string; studentName?: string; routeId: string; stopId?: string; isActive: boolean; route?: Route_; stop?: Stop }
interface Delay { id: string; routeId: string; date: string; reason: string; scheduledTime?: string; actualTime?: string; parentsNotified: boolean; route?: Route_ }
interface Student { id: string; firstName: string; lastName: string }

const TABS = [
  { key: 'overview', label: 'Routes & Fleet' },
  { key: 'assignments', label: 'Student Assignments' },
  { key: 'delays', label: 'Delays' },
  { key: 'fees', label: 'Transport Fees' },
];

@Component({
  selector: 'app-admin-transport',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Transport" [navSections]="adminNav">
<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">School operations</p>
    <h2 class="wf-title">Transport</h2>
    <p class="wf-sub">Routes, vehicles, drivers and student pickups in one place.</p>
  </div>
  <div class="wf-stats">
    <div class="wf-stat"><strong>{{ routes.length }}</strong><span>Routes</span></div>
    <div class="wf-stat"><strong>{{ vehicles.length }}</strong><span>Vehicles</span></div>
    <div class="wf-stat"><strong>{{ drivers.length }}</strong><span>Drivers</span></div>
    <div class="wf-stat"><strong>{{ assignments.length }}</strong><span>Assignments</span></div>
  </div>
</header>
<div class="card">
  <div class="tab-bar" role="tablist">
    @for (t of tabs; track t.key) {
      <button type="button" role="tab" [class.active]="tab()===t.key" [attr.aria-selected]="tab()===t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (tab() === 'overview') {
    <div class="grid-2">
      <div>
        <h3>Routes</h3>
        <div class="toolbar"><button class="btn-primary" (click)="showRouteForm=!showRouteForm">+ Route</button></div>
        @if (showRouteForm) {
          <div class="form-grid wf-form">
            <input [(ngModel)]="route.code" placeholder="Code" /><input [(ngModel)]="route.name" placeholder="Name" />
            <input [(ngModel)]="route.description" placeholder="Description" />
            <button class="btn-primary" (click)="saveRoute()">Save</button>
          </div>
        }
        <table class="data-table"><thead><tr><th>Code</th><th>Name</th><th></th></tr></thead><tbody>
          @for (r of routes; track r.id) {
            <tr><td>{{ r.code }}</td><td>{{ r.name }}</td>
              <td><button class="btn-outline" (click)="addStop(r)">+ Stop</button>
                <button class="btn-outline" (click)="delRoute(r)">Delete</button></td></tr>
            @for (s of stopsFor(r.id); track s.id) {
              <tr><td></td><td style="padding-left:1.5rem">↳ {{ s.name }} {{ s.pickupTime ? '('+s.pickupTime+')' : '' }}</td>
                <td><button class="btn-outline" (click)="delStop(s)">×</button></td></tr>
            }
          } @empty { <tr class="wf-empty-row"><td colspan="3">No routes</td></tr> }
        </tbody></table>
      </div>
      <div>
        <h3>Vehicles & Drivers</h3>
        <div class="toolbar">
          <button class="btn-primary" (click)="showVehicleForm=!showVehicleForm">+ Vehicle</button>
          <button class="btn-outline" (click)="showDriverForm=!showDriverForm">+ Driver</button>
        </div>
        @if (showVehicleForm) {
          <div class="form-grid wf-form">
            <input [(ngModel)]="vehicle.registration" placeholder="Registration" /><input [(ngModel)]="vehicle.make" placeholder="Make" />
            <input [(ngModel)]="vehicle.capacity" type="number" placeholder="Capacity" />
            <select [(ngModel)]="vehicle.routeId"><option value="">Route…</option>@for (r of routes; track r.id) { <option [value]="r.id">{{ r.code }}</option> }</select>
            <select [(ngModel)]="vehicle.driverId"><option value="">Driver…</option>@for (d of drivers; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select>
            <button class="btn-primary" (click)="saveVehicle()">Save</button>
          </div>
        }
        @if (showDriverForm) {
          <div class="form-grid wf-form">
            <input [(ngModel)]="driver.name" placeholder="Name" /><input [(ngModel)]="driver.phone" placeholder="Phone" />
            <input [(ngModel)]="driver.licenseNumber" placeholder="License no." /><input [(ngModel)]="driver.licenseExpiry" type="date" placeholder="License expiry" />
            <button class="btn-primary" (click)="saveDriver()">Save</button>
          </div>
        }
        <table class="data-table"><thead><tr><th>Reg</th><th>Make</th><th>Route</th><th>Driver</th><th>Status</th></tr></thead><tbody>
          @for (v of vehicles; track v.id) {
            <tr><td>{{ v.registration }}</td><td>{{ v.make }}</td><td>{{ v.routeCode || '—' }}</td><td>{{ v.driverName || '—' }}</td><td><span class="wf-pill">{{ v.status }}</span></td></tr>
          } @empty { <tr class="wf-empty-row"><td colspan="5">No vehicles</td></tr> }
        </tbody></table>
        <h3 style="margin-top:1rem">Drivers</h3>
        <table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>License</th><th>Expiry</th></tr></thead><tbody>
          @for (d of drivers; track d.id) {
            <tr><td>{{ d.name }}</td><td>{{ d.phone || '—' }}</td><td>{{ d.licenseNumber || '—' }}</td><td>{{ d.licenseExpiry || '—' }}</td></tr>
          } @empty { <tr class="wf-empty-row"><td colspan="4">No drivers</td></tr> }
        </tbody></table>
      </div>
    </div>
  }

  @if (tab() === 'assignments') {
    <div class="toolbar" style="margin-bottom:1rem">
      <button class="btn-primary" (click)="showAssignForm=!showAssignForm">+ Assign student</button>
    </div>
    @if (showAssignForm) {
      <div class="wf-form">
        <div class="form-grid">
          <select [(ngModel)]="assign.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
          <select [(ngModel)]="assign.routeId"><option value="">Route…</option>@for (r of routes; track r.id) { <option [value]="r.id">{{ r.code }} — {{ r.name }}</option> }</select>
          <select [(ngModel)]="assign.stopId"><option value="">Pickup stop…</option>@for (s of stops; track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select>
          <input [(ngModel)]="assign.termId" placeholder="Term ID (optional)" />
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveAssignment()">Assign</button>
          <button class="btn-outline" (click)="showAssignForm=false">Cancel</button>
        </div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Student</th><th>Route</th><th>Stop</th><th>Active</th><th></th></tr></thead><tbody>
      @for (a of assignments; track a.id) {
        <tr><td>{{ a.studentName }}</td><td>{{ a.route?.name }}</td><td>{{ a.stop?.name || '—' }}</td><td><span class="wf-pill" [class.on]="a.isActive">{{ a.isActive ? 'Active' : 'Inactive' }}</span></td>
          <td><button class="btn-outline" (click)="toggleAssignment(a)">{{ a.isActive ? 'Deactivate' : 'Activate' }}</button></td></tr>
      } @empty { <tr class="wf-empty-row"><td colspan="5">No assignments</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'delays') {
    <div class="toolbar" style="margin-bottom:1rem">
      <button class="btn-primary" (click)="showDelayForm=!showDelayForm">+ Report delay</button>
    </div>
    @if (showDelayForm) {
      <div class="wf-form">
        <div class="form-grid">
          <select [(ngModel)]="delay.routeId"><option value="">Route…</option>@for (r of routes; track r.id) { <option [value]="r.id">{{ r.code }} — {{ r.name }}</option> }</select>
          <select [(ngModel)]="delay.vehicleId"><option value="">Vehicle…</option>@for (v of vehicles; track v.id) { <option [value]="v.id">{{ v.registration }}</option> }</select>
          <input [(ngModel)]="delay.date" type="date" /><input [(ngModel)]="delay.scheduledTime" type="time" title="Scheduled" /><input [(ngModel)]="delay.actualTime" type="time" title="Actual" />
          <input [(ngModel)]="delay.reason" placeholder="Reason" />
          <label><input type="checkbox" [(ngModel)]="delay.notifyParents" [checked]="true" /> Notify parents</label>
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveDelay()">Report</button>
          <button class="btn-outline" (click)="showDelayForm=false">Cancel</button>
        </div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Date</th><th>Route</th><th>Scheduled</th><th>Actual</th><th>Reason</th><th>Parents notified</th></tr></thead><tbody>
      @for (d of delays; track d.id) {
        <tr><td>{{ d.date }}</td><td>{{ d.route?.name }}</td><td>{{ d.scheduledTime || '—' }}</td><td>{{ d.actualTime || '—' }}</td><td>{{ d.reason }}</td><td>{{ d.parentsNotified ? 'Yes' : 'No' }}</td></tr>
      } @empty { <tr class="wf-empty-row"><td colspan="6">No delays reported</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'fees') {
    <p>Issue a transport invoice linked to a student's account.</p>
    <div class="form-grid" style="max-width:640px">
      <select [(ngModel)]="fee.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
      <input [(ngModel)]="fee.amount" type="number" placeholder="Amount" />
      <input [(ngModel)]="fee.termId" placeholder="Term ID" />
      <input [(ngModel)]="fee.dueDate" type="date" title="Due date" />
      <input [(ngModel)]="fee.description" placeholder="Description" />
      <button class="btn-primary" (click)="issueFee()">Issue invoice</button>
    </div>
    @if (feeResult) { <p class="success">Invoice {{ feeResult.invoice?.invoiceNumber }} issued for {{ feeResult.studentName }}</p> }
  }
</div>
</app-portal-layout>`,
})
export class AdminTransportComponent implements OnInit {
  readonly adminNav = ADMIN_NAV_SECTIONS;
  private api = inject(ApiService);

  tabs = TABS;
  tab = signal('overview');

  routes: Route_[] = [];
  stops: Stop[] = [];
  drivers: Driver[] = [];
  vehicles: Vehicle[] = [];
  assignments: Assignment[] = [];
  delays: Delay[] = [];
  students: Student[] = [];

  showRouteForm = false; showVehicleForm = false; showDriverForm = false;
  showAssignForm = false; showDelayForm = false;
  route: any = {}; vehicle: any = {}; driver: any = {}; assign: any = {}; delay: any = { notifyParents: true };
  fee: any = { description: 'School transport fee' };
  feeResult: any = null;

  ngOnInit() { this.load(); this.loadStudents(); }

  load() {
    this.api.get<any>('/transport/routes').subscribe({
      next: (r) => { this.routes = r.routes || []; this.stops = r.stops || []; this.vehicles = r.vehicles || []; this.drivers = r.drivers || []; },
      error: () => {},
    });
    this.api.get<Assignment[]>('/transport/assignments').subscribe({ next: (r) => (this.assignments = r || []), error: () => {} });
    this.api.get<Delay[]>('/transport/delays').subscribe({ next: (r) => (this.delays = r || []), error: () => {} });
  }

  loadStudents() {
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
  }

  stopsFor(routeId: string) { return this.stops.filter((s) => s.routeId === routeId).sort((a, b) => a.sequence - b.sequence); }

  saveRoute() {
    this.api.post('/transport/routes', this.route).subscribe({ next: () => { this.showRouteForm = false; this.route = {}; this.load(); }, error: () => {} });
  }

  delRoute(r: Route_) {
    this.api.patch(`/transport/routes/${r.id}`, { isActive: false }).subscribe({ next: () => this.load(), error: () => {} });
  }

  addStop(r: Route_) {
    const name = prompt('Stop name');
    if (!name) return;
    this.api.post('/transport/stops', { routeId: r.id, name, sequence: this.stopsFor(r.id).length + 1 }).subscribe({ next: () => this.load(), error: () => {} });
  }

  delStop(s: Stop) {
    this.api.delete(`/transport/stops/${s.id}`).subscribe({ next: () => this.load(), error: () => {} });
  }

  saveVehicle() {
    this.api.post('/transport/vehicles', this.vehicle).subscribe({ next: () => { this.showVehicleForm = false; this.vehicle = {}; this.load(); }, error: () => {} });
  }

  saveDriver() {
    this.api.post('/transport/drivers', this.driver).subscribe({ next: () => { this.showDriverForm = false; this.driver = {}; this.load(); }, error: () => {} });
  }

  saveAssignment() {
    if (!this.assign.studentId || !this.assign.routeId) return;
    this.api.post('/transport/assignments', this.assign).subscribe({
      next: () => { this.showAssignForm = false; this.assign = {}; this.load(); }, error: () => {},
    });
  }

  toggleAssignment(a: Assignment) {
    this.api.patch(`/transport/assignments/${a.id}`, { isActive: !a.isActive }).subscribe({ next: () => this.load(), error: () => {} });
  }

  saveDelay() {
    if (!this.delay.routeId || !this.delay.date || !this.delay.reason) return;
    this.api.post('/transport/delays', this.delay).subscribe({
      next: () => { this.showDelayForm = false; this.delay = { notifyParents: true }; this.load(); }, error: () => {},
    });
  }

  issueFee() {
    if (!this.fee.studentId || !this.fee.amount) return;
    this.api.post('/transport/fee-invoice', this.fee).subscribe({
      next: (r: any) => { this.feeResult = r; this.fee = { description: 'School transport fee' }; },
      error: () => {},
    });
  }
}
