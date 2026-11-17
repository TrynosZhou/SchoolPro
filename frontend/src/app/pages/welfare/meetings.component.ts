import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Slot {
  id: string; teacherId: string; teacherName?: string; date: string;
  startTime: string; endTime: string; location?: string; topic?: string;
  maxBookings?: number; status: string; bookedCount?: number;
}
interface Booking {
  id: string; slotId: string; parentId: string; parentName?: string;
  studentId?: string; studentName?: string; note?: string; status: string;
  slot?: { date: string; startTime: string; endTime: string; teacherName?: string; location?: string; topic?: string };
}
interface Student { id: string; firstName: string; lastName: string }

@Component({
  selector: 'app-meetings',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout [portalTitle]="portalTitle" pageTitle="Parent-Teacher Meetings" [navSections]="navSections" [navItems]="navItems">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    @if (isParent) {
      <input type="date" [(ngModel)]="fromDate" /> <input type="date" [(ngModel)]="toDate" />
      <button class="btn-primary" (click)="load()">Find slots</button>
    } @else {
      <input type="date" [(ngModel)]="fromDate" /> <input type="date" [(ngModel)]="toDate" />
      <button class="btn-primary" (click)="load()">Load</button>
      <button class="btn-outline" (click)="showSlotForm=!showSlotForm">+ Publish slot</button>
    }
  </div>

  @if (showSlotForm && !isParent) {
    <div class="card" style="margin-bottom:1rem">
      <div class="form-grid">
        <input type="date" [(ngModel)]="slot.date" />
        <input type="time" [(ngModel)]="slot.startTime" />
        <input type="time" [(ngModel)]="slot.endTime" />
        <input [(ngModel)]="slot.location" placeholder="Location" />
        <input [(ngModel)]="slot.topic" placeholder="Topic (optional)" />
        <input [(ngModel)]="slot.maxBookings" type="number" placeholder="Max bookings" />
      </div>
      <div class="toolbar" style="margin-top:.5rem">
        <button class="btn-primary" (click)="saveSlot()">Publish</button>
        <button class="btn-outline" (click)="showSlotForm=false">Cancel</button>
      </div>
    </div>
  }

  <h3>Available slots</h3>
  <div class="table-scroll"><table class="data-table">
    <thead><tr><th>Date</th><th>Time</th><th>Teacher</th><th>Location</th><th>Topic</th><th>Booked</th><th></th></tr></thead>
    <tbody>@for (s of slots; track s.id) {
      <tr>
        <td>{{ s.date }}</td><td>{{ s.startTime }}–{{ s.endTime }}</td><td>{{ s.teacherName || s.teacherId }}</td>
        <td>{{ s.location || '—' }}</td><td>{{ s.topic || '—' }}</td>
        <td>{{ s.bookedCount ?? '—' }}{{ s.maxBookings ? '/' + s.maxBookings : '' }}</td>
        <td>
          @if (isParent) {
            <button class="btn-primary" (click)="book(s)" [disabled]="s.status!=='open'">Book</button>
          } @else {
            <button class="btn-outline" (click)="closeSlot(s)">{{ s.status === 'open' ? 'Close' : 'Reopen' }}</button>
            <button class="btn-outline" (click)="delSlot(s)">Delete</button>
          }
        </td>
      </tr>
    } @empty { <tr><td colspan="7">No slots found</td></tr> }</tbody>
  </table></div>

  <h3 style="margin-top:1.5rem">{{ isParent ? 'My bookings' : 'Bookings' }}</h3>
  <div class="table-scroll"><table class="data-table">
    <thead><tr><th>Slot</th><th>Teacher</th><th>@if (isParent) { Child } @else { Parent }</th><th>Status</th><th></th></tr></thead>
    <tbody>@for (b of bookings; track b.id) {
      <tr>
        <td>{{ b.slot?.date }} {{ b.slot?.startTime }}</td><td>{{ b.slot?.teacherName }}</td>
        <td>{{ isParent ? (b.studentName || '—') : (b.parentName || '—') }}</td>
        <td><span class="badge">{{ b.status }}</span></td>
        <td>
          @if (isParent && b.status==='confirmed') { <button class="btn-outline" (click)="cancelBooking(b)">Cancel</button> }
          @if (!isParent && b.status==='confirmed') { <button class="btn-outline" (click)="completeBooking(b)">Complete</button> }
        </td>
      </tr>
    } @empty { <tr><td colspan="5">No bookings</td></tr> }</tbody>
  </table></div>
</div>
</app-portal-layout>`,
})
export class MeetingsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;

  get role() { return this.auth.user()?.role || ''; }
  get isParent() { return this.role === 'parent'; }
  get portalTitle() { return this.isParent ? 'Parent Portal' : this.role === 'teacher' ? 'Teacher Portal' : 'Admin Portal'; }
  get navSections() { return this.isParent ? [] : this.role === 'teacher' ? this.teacherNav : this.adminNav; }
  get navItems() { return this.isParent ? this.parentNav : []; }

  slots: Slot[] = [];
  bookings: Booking[] = [];
  students: Student[] = [];
  showSlotForm = false;
  fromDate = ''; toDate = '';
  slot: any = {};
  bookStudentId = '';

  ngOnInit() {
    const today = new Date().toISOString().slice(0, 10);
    this.fromDate = today;
    this.toDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    if (this.isParent) {
      this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
    }
    this.load();
  }

  load() {
    const p: any = {};
    if (this.fromDate) p.from = this.fromDate;
    if (this.toDate) p.to = this.toDate;
    this.api.get<Slot[]>('/meetings/slots', p).subscribe({ next: (r) => (this.slots = r || []), error: () => {} });
    this.api.get<Booking[]>('/meetings/bookings', p).subscribe({ next: (r) => (this.bookings = r || []), error: () => {} });
  }

  saveSlot() {
    if (!this.slot.date || !this.slot.startTime || !this.slot.endTime) return;
    this.api.post('/meetings/slots', this.slot).subscribe({
      next: () => { this.showSlotForm = false; this.slot = {}; this.load(); }, error: () => {},
    });
  }

  closeSlot(s: Slot) {
    this.api.patch(`/meetings/slots/${s.id}`, { status: s.status === 'open' ? 'closed' : 'open' }).subscribe({ next: () => this.load(), error: () => {} });
  }

  delSlot(s: Slot) {
    this.api.delete(`/meetings/slots/${s.id}`).subscribe({ next: () => this.load(), error: () => {} });
  }

  book(s: Slot) {
    const body: any = { slotId: s.id };
    if (this.bookStudentId) body.studentId = this.bookStudentId;
    this.api.post('/meetings/bookings', body).subscribe({ next: () => this.load(), error: () => {} });
  }

  cancelBooking(b: Booking) {
    this.api.patch(`/meetings/bookings/${b.id}`, { status: 'cancelled' }).subscribe({ next: () => this.load(), error: () => {} });
  }

  completeBooking(b: Booking) {
    this.api.patch(`/meetings/bookings/${b.id}`, { status: 'completed' }).subscribe({ next: () => this.load(), error: () => {} });
  }
}
