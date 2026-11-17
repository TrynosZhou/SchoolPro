import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface CalEvent {
  id: string; title: string; description?: string; type: string;
  startDate: string; endDate?: string; allDay: boolean; location?: string;
  audience: string; rsvps?: { attending: number; maybe: number; notAttending: number; total: number };
}
interface Rsvp { id: string; eventId: string; response: string; guests: number }

const TYPES = ['holiday', 'exam', 'event', 'meeting', 'deadline', 'other'];

@Component({
  selector: 'app-school-calendar',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout [portalTitle]="portalTitle" pageTitle="School Calendar" [navSections]="navSections" [navItems]="navItems">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    <input type="date" [(ngModel)]="from" (change)="load()" />
    <input type="date" [(ngModel)]="to" (change)="load()" />
    <select [(ngModel)]="typeFilter" (change)="load()"><option value="">All types</option>
      @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
    </select>
    <button class="btn-primary" (click)="icsUrl && openIcs()">Export .ics</button>
    @if (canManage) { <button class="btn-outline" (click)="showForm=!showForm">+ New event</button> }
  </div>

  @if (showForm && canManage) {
    <div class="card" style="margin-bottom:1rem">
      <div class="form-grid">
        <input [(ngModel)]="ev.title" placeholder="Title" />
        <select [(ngModel)]="ev.type">@for (t of types; track t) { <option [value]="t">{{ t }}</option> }</select>
        <input [(ngModel)]="ev.startDate" type="date" />
        <input [(ngModel)]="ev.endDate" type="date" title="End date" />
        <input [(ngModel)]="ev.location" placeholder="Location" />
        <select [(ngModel)]="ev.audience"><option value="all">Everyone</option><option value="parents">Parents</option><option value="staff">Staff</option><option value="students">Students</option></select>
        <textarea [(ngModel)]="ev.description" placeholder="Description" rows="2" style="grid-column:1/-1"></textarea>
      </div>
      <div class="toolbar" style="margin-top:.5rem">
        <button class="btn-primary" (click)="save()">Save event</button>
        <button class="btn-outline" (click)="showForm=false">Cancel</button>
      </div>
    </div>
  }

  @for (e of events; track e.id) {
    <div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <b>{{ e.title }}</b> <span class="badge">{{ e.type }}</span>
          @if (e.location) { <span class="badge">{{ e.location }}</span> }
          <div>{{ e.startDate }}{{ e.endDate && e.endDate !== e.startDate ? ' → ' + e.endDate : '' }} · {{ e.audience }}</div>
          @if (e.description) { <div style="color:#555;margin-top:.25rem">{{ e.description }}</div> }
          @if (e.rsvps && e.rsvps.total) { <div style="font-size:.85rem;color:#555">RSVP: {{ e.rsvps.attending }} attending · {{ e.rsvps.maybe }} maybe · {{ e.rsvps.notAttending }} not attending</div> }
        </div>
        <div class="toolbar">
          @if (canManage) {
            <button class="btn-outline" (click)="edit(e)">Edit</button>
            <button class="btn-outline" (click)="del(e)">Delete</button>
          }
          @if (!canManage || true) {
            <select [(ngModel)]="myRsvp[e.id]" (change)="rsvp(e)">
              <option value="">RSVP…</option><option value="attending">Attending</option>
              <option value="maybe">Maybe</option><option value="not_attending">Not attending</option>
            </select>
          }
        </div>
      </div>
    </div>
  } @empty { <p>No events in this range.</p> }
</div>
</app-portal-layout>`,
})
export class SchoolCalendarComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;
  readonly studentNav = STUDENT_NAV_SECTIONS;
  readonly types = TYPES;

  get role() { return this.auth.user()?.role || ''; }
  get canManage() { return ['admin', 'principal', 'director'].includes(this.role); }
  get portalTitle() {
    return this.role === 'parent' ? 'Parent Portal' : this.role === 'teacher' ? 'Teacher Portal' : this.role === 'student' ? 'Student Portal' : 'Admin Portal';
  }
  get navSections() {
    if (this.role === 'parent') return [];
    if (this.role === 'teacher') return this.teacherNav;
    if (this.role === 'student') return this.studentNav;
    return this.adminNav;
  }
  get navItems() { return this.role === 'parent' ? this.parentNav : []; }

  events: CalEvent[] = [];
  myRsvp: Record<string, string> = {};
  showForm = false;
  editingId = '';
  typeFilter = '';
  ev: any = { type: 'event', audience: 'all', allDay: true };
  icsUrl = '';

  from = new Date().toISOString().slice(0, 10);
  to = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  ngOnInit() { this.load(); }

  load() {
    const p: any = { from: this.from, to: this.to };
    if (this.typeFilter) p.type = this.typeFilter;
    this.api.get<CalEvent[]>('/calendar/events', p).subscribe({
      next: (r) => (this.events = r || []),
      error: () => {},
    });
    this.api.get<Rsvp[]>('/calendar/my-rsvps').subscribe({
      next: (r) => {
        for (const x of r || []) this.myRsvp[x.eventId] = x.response;
      },
      error: () => {},
    });
  }

  save() {
    if (!this.ev.title || !this.ev.startDate) return;
    const req = this.editingId
      ? this.api.patch(`/calendar/events/${this.editingId}`, this.ev)
      : this.api.post('/calendar/events', this.ev);
    req.subscribe({
      next: () => { this.showForm = false; this.editingId = ''; this.ev = { type: 'event', audience: 'all', allDay: true }; this.load(); },
      error: () => {},
    });
  }

  edit(e: CalEvent) {
    this.editingId = e.id;
    this.ev = { title: e.title, description: e.description, type: e.type, startDate: e.startDate, endDate: e.endDate, location: e.location, audience: e.audience, allDay: e.allDay };
    this.showForm = true;
  }

  del(e: CalEvent) {
    this.api.delete(`/calendar/events/${e.id}`).subscribe({ next: () => this.load(), error: () => {} });
  }

  rsvp(e: CalEvent) {
    const response = this.myRsvp[e.id];
    if (!response) return;
    this.api.post('/calendar/rsvp', { eventId: e.id, response }).subscribe({ next: () => this.load(), error: () => {} });
  }

  openIcs() {
    // ICS feed requires auth header — fetch as blob then open
    this.api.getBlob('/calendar/feed.ics', { from: this.from, to: this.to }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => {},
    });
  }
}
