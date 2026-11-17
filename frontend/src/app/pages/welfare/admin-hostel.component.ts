import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Dorm { id: string; name: string; type: string; capacity: number; wardenName?: string; occupied: number; totalBeds: number; isActive: boolean }
interface Bed { id: string; dormitoryId: string; bedNumber: string; roomLabel?: string; studentId?: string; status: string }
interface Exeat { id: string; studentId: string; studentName?: string; destination: string; departureAt: string; returnAt: string; reason?: string; status: string; approvalNote?: string }
interface RollCall { id: string; dormitoryId: string; date: string; time?: string; conductedByName?: string; entries: any[] }
interface HostelItem { id: string; name: string; category: string; quantity: number; condition: number; dormitoryId?: string; notes?: string }
interface Student { id: string; firstName: string; lastName: string }

const TABS = [
  { key: 'dorms', label: 'Dormitories & Beds' },
  { key: 'exeats', label: 'Exeat Passes' },
  { key: 'rollcall', label: 'Roll Calls' },
  { key: 'inventory', label: 'Hostel Inventory' },
];

@Component({
  selector: 'app-admin-hostel',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Boarding & Hostel" [navSections]="adminNav">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    @for (t of tabs; track t.key) {
      <button class="btn-outline" [style.fontWeight]="tab()===t.key?'700':'400'" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (tab() === 'dorms') {
    <div class="toolbar" style="margin-bottom:1rem">
      <button class="btn-primary" (click)="showDormForm=!showDormForm">+ Dormitory</button>
      <button class="btn-outline" (click)="showBedDorm && (showBedForm=!showBedForm)">+ Bed</button>
    </div>
    @if (showDormForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="dorm.name" placeholder="Name" /><select [(ngModel)]="dorm.type"><option value="boys">Boys</option><option value="girls">Girls</option><option value="mixed">Mixed</option></select>
        <input [(ngModel)]="dorm.capacity" type="number" placeholder="Capacity" /><input [(ngModel)]="dorm.location" placeholder="Location" />
        <button class="btn-primary" (click)="saveDorm()">Save</button>
      </div>
    }
    @if (showBedForm && showBedDorm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="bed.bedNumber" placeholder="Bed no." /><input [(ngModel)]="bed.roomLabel" placeholder="Room" />
        <button class="btn-primary" (click)="saveBed()">Save bed</button>
      </div>
    }
    @for (d of dorms; track d.id) {
      <div class="card" style="margin-bottom:.75rem">
        <b>{{ d.name }}</b> <span class="badge">{{ d.type }}</span>
        <span style="color:#555">{{ d.occupied }}/{{ d.totalBeds }} beds · capacity {{ d.capacity }}{{ d.wardenName ? ' · warden ' + d.wardenName : '' }}</span>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-outline" (click)="showBedDorm=d.id; showBedForm=true; bed={}">+ Bed</button>
          <button class="btn-outline" (click)="showAllocBed=d.id">Allocate bed</button>
        </div>
        @if (showAllocBed === d.id) {
          <div class="form-grid" style="margin-top:.5rem">
            <select [(ngModel)]="allocBedId"><option value="">Vacant bed…</option>
              @for (b of bedsFor(d.id); track b.id) { @if (b.status!=='occupied') { <option [value]="b.id">{{ b.bedNumber }}{{ b.roomLabel ? ' ('+b.roomLabel+')' : '' }}</option> } }
            </select>
            <select [(ngModel)]="allocStudentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
            <button class="btn-primary" (click)="allocate()">Allocate</button>
          </div>
        }
        <table class="data-table" style="margin-top:.5rem"><thead><tr><th>Bed</th><th>Room</th><th>Occupant</th><th>Status</th><th></th></tr></thead><tbody>
          @for (b of bedsFor(d.id); track b.id) {
            <tr><td>{{ b.bedNumber }}</td><td>{{ b.roomLabel || '—' }}</td><td>{{ studentName(b.studentId) }}</td><td>{{ b.status }}</td>
              <td>@if (b.status==='occupied') { <button class="btn-outline" (click)="vacate(b)">Vacate</button> }</td></tr>
          } @empty { <tr><td colspan="5">No beds</td></tr> }
        </tbody></table>
      </div>
    } @empty { <p>No dormitories yet.</p> }
  }

  @if (tab() === 'exeats') {
    <div class="toolbar" style="margin-bottom:1rem"><button class="btn-primary" (click)="showExeatForm=!showExeatForm">+ New exeat</button></div>
    @if (showExeatForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <select [(ngModel)]="exeat.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
          <input [(ngModel)]="exeat.destination" placeholder="Destination" />
          <input [(ngModel)]="exeat.departureAt" type="datetime-local" title="Departure" />
          <input [(ngModel)]="exeat.returnAt" type="datetime-local" title="Return" />
          <input [(ngModel)]="exeat.reason" placeholder="Reason" />
        </div>
        <div class="toolbar" style="margin-top:.5rem">
          <button class="btn-primary" (click)="saveExeat()">Submit</button>
          <button class="btn-outline" (click)="showExeatForm=false">Cancel</button>
        </div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Student</th><th>Destination</th><th>Departure</th><th>Return</th><th>Status</th><th></th></tr></thead><tbody>
      @for (x of exeats; track x.id) {
        <tr><td>{{ x.studentName }}</td><td>{{ x.destination }}</td><td>{{ x.departureAt | date:'short' }}</td><td>{{ x.returnAt | date:'short' }}</td>
          <td><span class="badge">{{ x.status }}</span></td>
          <td>
            @if (x.status==='requested') {
              <button class="btn-outline" (click)="reviewExeat(x,'approved')">Approve</button>
              <button class="btn-outline" (click)="reviewExeat(x,'rejected')">Reject</button>
            }
            @if (x.status==='approved') { <button class="btn-outline" (click)="reviewExeat(x,'returned')">Mark returned</button> }
          </td></tr>
      } @empty { <tr><td colspan="6">No exeat passes</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'rollcall') {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="rollDorm"><option value="">Dormitory…</option>@for (d of dorms; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select>
      <input type="date" [(ngModel)]="rollDate" />
      <button class="btn-primary" (click)="startRollCall()" [disabled]="!rollDorm">Start roll call</button>
    </div>
    @if (rollBeds.length) {
      <div class="card" style="margin-bottom:1rem">
        <table class="data-table"><thead><tr><th>Bed</th><th>Student</th><th>Status</th></tr></thead><tbody>
          @for (b of rollBeds; track b.id) {
            <tr><td>{{ b.bedNumber }}</td><td>{{ studentName(b.studentId) }}</td>
              <td><select [(ngModel)]="b._status"><option value="present">Present</option><option value="absent">Absent</option><option value="sick">Sick</option></select></td></tr>
          }
        </tbody></table>
        <div class="toolbar" style="margin-top:.5rem"><button class="btn-primary" (click)="saveRollCall()">Save roll call</button></div>
      </div>
    }
    <h3>History</h3>
    <table class="data-table"><thead><tr><th>Date</th><th>Dorm</th><th>By</th><th>Present</th><th>Absent</th></tr></thead><tbody>
      @for (r of rollCalls; track r.id) {
        <tr><td>{{ r.date }} {{ r.time }}</td><td>{{ dormName(r.dormitoryId) }}</td><td>{{ r.conductedByName || '—' }}</td>
          <td>{{ countStatus(r,'present') }}</td><td>{{ countStatus(r,'absent') + countStatus(r,'sick') }}</td></tr>
      } @empty { <tr><td colspan="5">No roll calls</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'inventory') {
    <div class="toolbar" style="margin-bottom:1rem"><button class="btn-primary" (click)="showItemForm=!showItemForm">+ Item</button></div>
    @if (showItemForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="item.name" placeholder="Name" /><select [(ngModel)]="item.category"><option value="bedding">Bedding</option><option value="furniture">Furniture</option><option value="kitchen">Kitchen</option><option value="laundry">Laundry</option><option value="other">Other</option></select>
        <input [(ngModel)]="item.quantity" type="number" placeholder="Qty" /><input [(ngModel)]="item.condition" type="number" placeholder="Condition 0-100" />
        <select [(ngModel)]="item.dormitoryId"><option value="">Dormitory…</option>@for (d of dorms; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select>
        <button class="btn-primary" (click)="saveItem()">Save</button>
      </div>
    }
    <table class="data-table"><thead><tr><th>Name</th><th>Category</th><th>Qty</th><th>Condition</th><th>Dorm</th><th></th></tr></thead><tbody>
      @for (i of items; track i.id) {
        <tr><td>{{ i.name }}</td><td>{{ i.category }}</td><td>{{ i.quantity }}</td><td>{{ i.condition }}%</td><td>{{ dormName(i.dormitoryId) }}</td>
          <td><button class="btn-outline" (click)="editItem(i)">Edit</button></td></tr>
      } @empty { <tr><td colspan="6">No items</td></tr> }
    </tbody></table>
  }
</div>
</app-portal-layout>`,
})
export class AdminHostelComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  tabs = TABS;
  tab = signal('dorms');

  dorms: Dorm[] = [];
  beds: Bed[] = [];
  exeats: Exeat[] = [];
  rollCalls: RollCall[] = [];
  items: HostelItem[] = [];
  students: Student[] = [];

  showDormForm = false; showBedForm = false; showBedDorm = ''; showAllocBed = '';
  showExeatForm = false; showItemForm = false;
  dorm: any = { type: 'mixed' }; bed: any = {}; exeat: any = {}; item: any = { category: 'other' };
  allocBedId = ''; allocStudentId = '';
  rollDorm = ''; rollDate = new Date().toISOString().slice(0, 10); rollBeds: any[] = [];
  editingItem: HostelItem | null = null;

  ngOnInit() {
    this.load();
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
  }

  load() {
    this.api.get<any>('/hostel/overview').subscribe({
      next: (r) => { this.dorms = r.dormitories || []; this.beds = r.beds || []; },
      error: () => {},
    });
    this.api.get<Exeat[]>('/hostel/exeats').subscribe({ next: (r) => (this.exeats = r || []), error: () => {} });
    this.api.get<RollCall[]>('/hostel/roll-calls').subscribe({ next: (r) => (this.rollCalls = r || []), error: () => {} });
    this.api.get<HostelItem[]>('/hostel/inventory').subscribe({ next: (r) => (this.items = r || []), error: () => {} });
  }

  bedsFor(dormId: string) { return this.beds.filter((b) => b.dormitoryId === dormId); }
  dormName(id?: string) { return this.dorms.find((d) => d.id === id)?.name || '—'; }
  studentName(id?: string) { const s = this.students.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : '—'; }
  countStatus(r: RollCall, st: string) { return (r.entries || []).filter((e: any) => e.status === st).length; }

  saveDorm() {
    this.api.post('/hostel/dormitories', this.dorm).subscribe({ next: () => { this.showDormForm = false; this.dorm = { type: 'mixed' }; this.load(); }, error: () => {} });
  }

  saveBed() {
    if (!this.showBedDorm) return;
    this.api.post('/hostel/beds', { ...this.bed, dormitoryId: this.showBedDorm }).subscribe({
      next: () => { this.showBedForm = false; this.bed = {}; this.load(); }, error: () => {},
    });
  }

  allocate() {
    if (!this.allocBedId || !this.allocStudentId) return;
    this.api.post(`/hostel/beds/${this.allocBedId}/allocate`, { studentId: this.allocStudentId }).subscribe({
      next: () => { this.showAllocBed = ''; this.allocBedId = ''; this.allocStudentId = ''; this.load(); }, error: () => {},
    });
  }

  vacate(b: Bed) {
    this.api.post(`/hostel/beds/${b.id}/vacate`, {}).subscribe({ next: () => this.load(), error: () => {} });
  }

  saveExeat() {
    if (!this.exeat.studentId || !this.exeat.destination || !this.exeat.departureAt || !this.exeat.returnAt) return;
    this.api.post('/hostel/exeats', this.exeat).subscribe({
      next: () => { this.showExeatForm = false; this.exeat = {}; this.load(); }, error: () => {},
    });
  }

  reviewExeat(x: Exeat, status: string) {
    this.api.patch(`/hostel/exeats/${x.id}`, { status }).subscribe({ next: () => this.load(), error: () => {} });
  }

  startRollCall() {
    this.rollBeds = this.bedsFor(this.rollDorm).filter((b) => b.status === 'occupied').map((b) => ({ ...b, _status: 'present' }));
  }

  saveRollCall() {
    const entries = this.rollBeds.map((b) => ({ bedId: b.id, studentId: b.studentId, status: b._status }));
    this.api.post('/hostel/roll-calls', { dormitoryId: this.rollDorm, date: this.rollDate, time: new Date().toTimeString().slice(0, 5), entries }).subscribe({
      next: () => { this.rollBeds = []; this.load(); }, error: () => {},
    });
  }

  saveItem() {
    const req = this.editingItem
      ? this.api.patch(`/hostel/inventory/${this.editingItem.id}`, this.item)
      : this.api.post('/hostel/inventory', this.item);
    req.subscribe({ next: () => { this.showItemForm = false; this.editingItem = null; this.item = { category: 'other' }; this.load(); }, error: () => {} });
  }

  editItem(i: HostelItem) {
    this.editingItem = i;
    this.item = { ...i };
    this.showItemForm = true;
  }
}
