import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
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
interface MeetingsOverview { slots: number; openSlots: number; confirmed: number; completed: number; cancelled: number }

@Component({
  selector: 'app-meetings',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout [portalTitle]="portalTitle" pageTitle="Parent-Teacher Meetings" [navSections]="navSections" [navItems]="navItems">

<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">Student welfare</p>
    <h2 class="wf-title">Parent–Teacher Meetings</h2>
    <p class="wf-sub">
      @if (isParent) { Find an open time with your child’s teacher and manage the meetings you have booked. }
      @else { Publish meeting slots, see who has booked, and mark meetings as completed. }
    </p>
  </div>
  <div class="wf-stats">
    @if (!isParent) {
      <div class="wf-stat"><strong>{{ ov()?.openSlots ?? openCount }}</strong><span>Open slots</span></div>
    } @else {
      <div class="wf-stat"><strong>{{ openCount }}</strong><span>Open slots</span></div>
    }
    <div class="wf-stat"><strong>{{ ov()?.confirmed ?? confirmedCount }}</strong><span>Confirmed</span></div>
    <div class="wf-stat"><strong>{{ ov()?.completed ?? 0 }}</strong><span>Completed</span></div>
    <div class="wf-stat"><strong>{{ ov()?.cancelled ?? 0 }}</strong><span>Cancelled</span></div>
  </div>
</header>

<div class="card">
  @if (notice(); as n) {
    <div class="wf-notice" [class.ok]="n.kind==='ok'" [class.bad]="n.kind==='bad'" role="status">{{ n.text }}</div>
  }

  <div class="wf-bar">
    <label class="wf-field"><span>From</span><input type="date" [(ngModel)]="fromDate" /></label>
    <label class="wf-field"><span>To</span><input type="date" [(ngModel)]="toDate" /></label>
    @if (isParent && students.length > 1) {
      <label class="wf-field"><span>Booking for</span>
        <select [(ngModel)]="bookStudentId"><option value="">Select child…</option>
          @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
        </select>
      </label>
    }
    <button type="button" class="btn-primary" (click)="load()">{{ isParent ? 'Find slots' : 'Load' }}</button>
    <span class="wf-spacer"></span>
    @if (!isParent) { <button type="button" class="btn-outline" (click)="showSlotForm=!showSlotForm">+ Publish slot</button> }
  </div>

  @if (showSlotForm && !isParent) {
    <div class="wf-form form-grid">
      <h4 class="wf-form-title" style="grid-column:1/-1">Publish a meeting slot</h4>
      <label class="wf-field"><span>Date</span><input type="date" [(ngModel)]="slot.date" /></label>
      <label class="wf-field"><span>Starts</span><input type="time" [(ngModel)]="slot.startTime" /></label>
      <label class="wf-field"><span>Ends</span><input type="time" [(ngModel)]="slot.endTime" /></label>
      <label class="wf-field"><span>Location</span><input [(ngModel)]="slot.location" placeholder="e.g. Staff room" /></label>
      <label class="wf-field"><span>Topic</span><input [(ngModel)]="slot.topic" placeholder="Optional" /></label>
      <label class="wf-field"><span>Max bookings</span><input [(ngModel)]="slot.maxBookings" type="number" min="1" placeholder="Unlimited" /></label>
      <div class="wf-actions" style="grid-column:1/-1">
        <button type="button" class="btn-primary" (click)="saveSlot()">Publish</button>
        <button type="button" class="btn-outline" (click)="showSlotForm=false">Cancel</button>
      </div>
    </div>
  }

  <div class="wf-section"><h3>Available slots</h3><small>{{ slots.length }} in range</small></div>
  <div class="table-scroll"><table class="data-table wf-table">
    <thead><tr><th>Date</th><th>Time</th><th>Teacher</th><th>Location</th><th>Topic</th><th>Booked</th><th>Status</th><th></th></tr></thead>
    <tbody>
      @for (s of slots; track s.id) {
        <tr>
          <td>
            <div class="wf-slot">
              <span class="wf-slot-date"><strong>{{ s.date | date:'d' }}</strong><span>{{ s.date | date:'MMM' }}</span></span>
              <span class="wf-muted">{{ s.date | date:'EEE' }}</span>
            </div>
          </td>
          <td><span class="wf-slot-time">{{ short(s.startTime) }} – {{ short(s.endTime) }}</span></td>
          <td class="wf-strong">{{ s.teacherName || s.teacherId }}</td>
          <td>{{ s.location || '—' }}</td>
          <td><div class="wf-clip" [title]="s.topic || ''">{{ s.topic || '—' }}</div></td>
          <td>
            <div class="wf-progress">
              <div class="wf-progress-track"><div class="wf-progress-fill" [style.width.%]="fill(s)"></div></div>
              <small>{{ s.bookedCount ?? 0 }}{{ s.maxBookings ? ' / ' + s.maxBookings : '' }}</small>
            </div>
          </td>
          <td><span class="wf-pill" [class.ok]="s.status==='open'" [class.muted]="s.status!=='open'">{{ s.status }}</span></td>
          <td>
            <div class="wf-row-actions">
              @if (isParent) {
                <button type="button" class="btn-primary" (click)="book(s)" [disabled]="s.status!=='open' || isFull(s)">{{ isFull(s) ? 'Full' : 'Book' }}</button>
              } @else {
                <button type="button" class="btn-outline" (click)="closeSlot(s)">{{ s.status === 'open' ? 'Close' : 'Reopen' }}</button>
                <button type="button" class="btn-outline btn-warn-outline" (click)="delSlot(s)">Delete</button>
              }
            </div>
          </td>
        </tr>
      } @empty {
        <tr class="wf-empty-row"><td colspan="8"><div class="wf-empty-inline"><strong>No slots found</strong><span>@if (isParent) { Try widening the date range. } @else { Publish a slot to let parents book a time. }</span></div></td></tr>
      }
    </tbody>
  </table></div>

  <div class="wf-section"><h3>{{ isParent ? 'My bookings' : 'Bookings' }}</h3><small>{{ bookings.length }} in range</small></div>
  <div class="table-scroll"><table class="data-table wf-table">
    <thead><tr><th>Slot</th><th>Teacher</th><th>@if (isParent) { Child } @else { Parent }</th><th>Status</th><th></th></tr></thead>
    <tbody>
      @for (b of bookings; track b.id) {
        <tr>
          <td>
            @if (b.slot) { <span class="wf-strong">{{ b.slot.date | date:'EEE d MMM' }}</span><div class="wf-meta">{{ short(b.slot.startTime) }} – {{ short(b.slot.endTime) }}{{ b.slot.location ? ' · ' + b.slot.location : '' }}</div> } @else { — }
          </td>
          <td>{{ b.slot?.teacherName || '—' }}</td>
          <td>{{ isParent ? (b.studentName || '—') : (b.parentName || '—') }}</td>
          <td><span class="wf-pill" [class.ok]="b.status==='completed'" [class.info]="b.status==='confirmed'" [class.muted]="b.status==='cancelled'">{{ b.status }}</span></td>
          <td>
            <div class="wf-row-actions">
              @if (isParent && b.status==='confirmed') { <button type="button" class="btn-outline btn-warn-outline" (click)="cancelBooking(b)">Cancel</button> }
              @if (!isParent && b.status==='confirmed') { <button type="button" class="btn-outline" (click)="completeBooking(b)">Complete</button> }
            </div>
          </td>
        </tr>
      } @empty {
        <tr class="wf-empty-row"><td colspan="5"><div class="wf-empty-inline"><strong>No bookings</strong><span>Booked meetings will appear here.</span></div></td></tr>
      }
    </tbody>
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
  ov = signal<MeetingsOverview | null>(null);
  notice = signal<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  private noticeTimer: any;

  get openCount() { return this.slots.filter((s) => s.status === 'open').length; }
  get confirmedCount() { return this.bookings.filter((b) => b.status === 'confirmed').length; }

  ngOnInit() {
    const today = new Date().toISOString().slice(0, 10);
    this.fromDate = today;
    this.toDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    if (this.isParent) {
      this.api.get<Student[]>('/students').subscribe({
        next: (r) => {
          this.students = r || [];
          if (this.students.length === 1) this.bookStudentId = this.students[0].id;
        },
        error: () => {},
      });
    }
    this.load();
  }

  short(t?: string) { return (t || '').slice(0, 5); }
  fill(s: Slot) { return s.maxBookings ? Math.min(100, ((s.bookedCount ?? 0) / s.maxBookings) * 100) : ((s.bookedCount ?? 0) > 0 ? 100 : 0); }
  isFull(s: Slot) { return !!s.maxBookings && (s.bookedCount ?? 0) >= s.maxBookings; }

  private flash(text: string, kind: 'ok' | 'bad' = 'ok') {
    clearTimeout(this.noticeTimer);
    this.notice.set({ kind, text });
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4500);
  }
  private fail(e: any, fallback: string) { this.flash(e?.error?.message || fallback, 'bad'); }

  load() {
    const p: any = {};
    if (this.fromDate) p.from = this.fromDate;
    if (this.toDate) p.to = this.toDate;
    this.api.get<Slot[]>('/meetings/slots', p).subscribe({ next: (r) => (this.slots = r || []), error: () => {} });
    this.api.get<Booking[]>('/meetings/bookings', p).subscribe({ next: (r) => (this.bookings = r || []), error: () => {} });
    this.api.get<MeetingsOverview>('/meetings/overview', p).subscribe({ next: (r) => this.ov.set(r), error: () => {} });
  }

  saveSlot() {
    if (!this.slot.date || !this.slot.startTime || !this.slot.endTime) {
      this.flash('Enter a date, start time and end time.', 'bad');
      return;
    }
    if (this.slot.endTime <= this.slot.startTime) {
      this.flash('The end time must be after the start time.', 'bad');
      return;
    }
    this.api.post('/meetings/slots', this.slot).subscribe({
      next: () => { this.showSlotForm = false; this.slot = {}; this.load(); this.flash('Slot published.'); },
      error: (e) => this.fail(e, 'Could not publish the slot.'),
    });
  }

  closeSlot(s: Slot) {
    this.api.patch(`/meetings/slots/${s.id}`, { status: s.status === 'open' ? 'closed' : 'open' }).subscribe({
      next: () => this.load(), error: (e) => this.fail(e, 'Could not update the slot.'),
    });
  }

  delSlot(s: Slot) {
    if (!confirm('Delete this slot? Any bookings against it will be affected.')) return;
    this.api.delete(`/meetings/slots/${s.id}`).subscribe({
      next: () => { this.load(); this.flash('Slot deleted.'); }, error: (e) => this.fail(e, 'Could not delete the slot.'),
    });
  }

  book(s: Slot) {
    if (this.students.length > 1 && !this.bookStudentId) {
      this.flash('Choose which child this meeting is for.', 'bad');
      return;
    }
    const body: any = { slotId: s.id };
    if (this.bookStudentId) body.studentId = this.bookStudentId;
    this.api.post('/meetings/bookings', body).subscribe({
      next: () => { this.load(); this.flash('Meeting booked.'); }, error: (e) => this.fail(e, 'Could not book the slot.'),
    });
  }

  cancelBooking(b: Booking) {
    this.api.patch(`/meetings/bookings/${b.id}`, { status: 'cancelled' }).subscribe({
      next: () => { this.load(); this.flash('Booking cancelled.'); }, error: (e) => this.fail(e, 'Could not cancel the booking.'),
    });
  }

  completeBooking(b: Booking) {
    this.api.patch(`/meetings/bookings/${b.id}`, { status: 'completed' }).subscribe({
      next: () => { this.load(); this.flash('Meeting marked as completed.'); }, error: (e) => this.fail(e, 'Could not update the booking.'),
    });
  }
}
