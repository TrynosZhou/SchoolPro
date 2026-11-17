import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Alumni { id: string; firstName: string; lastName: string; graduationYear?: number; className?: string; email?: string; phone?: string; currentOccupation?: string; location?: string }
interface AlumniEvent { id: string; title: string; description?: string; date?: string; venue?: string; type: string; fundraisingTarget: number; amountRaised: number; status: string }
interface Donation { id: string; alumniId: string; alumni?: Alumni; amount: number; method: string; date: string }

const TABS = [
  { key: 'directory', label: 'Directory' },
  { key: 'events', label: 'Events' },
  { key: 'fundraising', label: 'Fundraising' },
];

@Component({
  selector: 'app-admin-alumni',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe, DecimalPipe],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Alumni" [navSections]="adminNav">
<div class="alumni-page">

  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Alumni Relations</p>
      <h2>Alumni</h2>
      <p class="hero-sub">Keep in touch with former students, host reunions and events, and record gifts that support the school.</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><span>Alumni</span><strong>{{ alumni.length }}</strong><small>In the directory</small></div>
      <div class="kpi"><span>Upcoming events</span><strong>{{ upcomingCount }}</strong><small>{{ events.length }} {{ events.length === 1 ? 'event' : 'events' }} in total</small></div>
      <div class="kpi"><span>Donations</span><strong>{{ donations.length }}</strong><small>Gifts recorded</small></div>
      <div class="kpi"><span>Total donated</span><strong>{{ totalDonated | number:'1.2-2' }}</strong><small>All recorded gifts</small></div>
    </div>
  </section>

  <div class="shell">
    <div class="tab-bar" role="tablist">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab" [class.active]="tab()===t.key" [attr.aria-selected]="tab()===t.key" (click)="tab.set(t.key)">
          {{ t.label }}<span class="tab-count">{{ tabCount(t.key) }}</span>
        </button>
      }
    </div>

    <div class="tab-body">

      @if (tab() === 'directory') {
        <div class="panel-head">
          <div><h3>Alumni directory</h3><p>Search former students and keep their details current.</p></div>
          <div class="actions">
            <button class="btn-primary" (click)="showAlumniForm=!showAlumniForm">+ Add</button>
            <button class="btn-outline" (click)="syncGraduated()">Sync graduates</button>
          </div>
        </div>

        <div class="search-row">
          <input [(ngModel)]="search" placeholder="Search name/email/occupation…" (keyup.enter)="loadDirectory()" />
          <button class="btn-primary" (click)="loadDirectory()">Search</button>
        </div>

        @if (showAlumniForm) {
          <div class="form-panel">
            <h4>Add alumnus</h4>
            <div class="fields">
              <div class="field"><label>First name *</label><input [(ngModel)]="alumniForm.firstName" placeholder="First name" /></div>
              <div class="field"><label>Last name *</label><input [(ngModel)]="alumniForm.lastName" placeholder="Last name" /></div>
              <div class="field"><label>Graduation year</label><input [(ngModel)]="alumniForm.graduationYear" type="number" placeholder="e.g. 2020" /></div>
              <div class="field"><label>Class</label><input [(ngModel)]="alumniForm.className" placeholder="Class" /></div>
              <div class="field"><label>Email</label><input [(ngModel)]="alumniForm.email" placeholder="Email" /></div>
              <div class="field"><label>Phone</label><input [(ngModel)]="alumniForm.phone" placeholder="Phone" /></div>
              <div class="field"><label>Occupation</label><input [(ngModel)]="alumniForm.currentOccupation" placeholder="Occupation" /></div>
              <div class="field"><label>Location</label><input [(ngModel)]="alumniForm.location" placeholder="Location" /></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveAlumni()">Save</button><button class="btn-outline" (click)="showAlumniForm=false">Cancel</button></div>
          </div>
        }

        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Name</th><th>Grad</th><th>Class</th><th>Email</th><th>Phone</th><th>Occupation</th><th>Location</th></tr></thead><tbody>
            @for (a of alumni; track a.id) {
              <tr><td><div class="person-cell"><span class="avatar">{{ initials(a) }}</span><span class="who"><strong>{{ a.firstName }} {{ a.lastName }}</strong></span></div></td>
                <td>@if (a.graduationYear) { <span class="pill cat">{{ a.graduationYear }}</span> } @else { <span class="muted">—</span> }</td>
                <td [class.muted]="!a.className">{{ a.className || '—' }}</td>
                <td [class.muted]="!a.email">{{ a.email || '—' }}</td><td [class.muted]="!a.phone">{{ a.phone || '—' }}</td><td [class.muted]="!a.currentOccupation">{{ a.currentOccupation || '—' }}</td><td [class.muted]="!a.location">{{ a.location || '—' }}</td></tr>
            } @empty { <tr><td colspan="7" class="empty-cell"><span class="empty-icon">☰</span><strong>No alumni found</strong><span>Add an alumnus or sync graduated students.</span></td></tr> }
          </tbody></table>
        </div>
      }

      @if (tab() === 'events') {
        <div class="panel-head">
          <div><h3>Alumni events</h3><p>Reunions, networking evenings and fundraisers.</p></div>
          <div class="actions"><button class="btn-primary" (click)="showEventForm=!showEventForm">+ Event</button></div>
        </div>
        @if (showEventForm) {
          <div class="form-panel">
            <h4>New event</h4>
            <div class="fields">
              <div class="field"><label>Title *</label><input [(ngModel)]="event.title" placeholder="Event title" /></div>
              <div class="field"><label>Type</label><select [(ngModel)]="event.type"><option value="reunion">Reunion</option><option value="fundraiser">Fundraiser</option><option value="networking">Networking</option><option value="other">Other</option></select></div>
              <div class="field"><label>Date and time</label><input [(ngModel)]="event.date" type="datetime-local" /></div>
              <div class="field"><label>Venue</label><input [(ngModel)]="event.venue" placeholder="Venue" /></div>
              <div class="field"><label>Fundraising target</label><input [(ngModel)]="event.fundraisingTarget" type="number" placeholder="0.00" /></div>
              <div class="field wide"><label>Description</label><textarea [(ngModel)]="event.description" placeholder="Description" rows="2"></textarea></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveEvent()">Save</button><button class="btn-outline" (click)="showEventForm=false">Cancel</button></div>
          </div>
        }
        <div class="event-grid">
          @for (e of events; track e.id) {
            <article class="event-card">
              <div class="event-head">
                <span class="pill cat">{{ e.type }}</span><span class="pill" [class]="'pill ' + e.status">{{ e.status }}</span>
                <h4>{{ e.title }}</h4>
              </div>
              <div class="event-meta">{{ e.date | date:'medium' }}{{ e.venue ? ' · ' + e.venue : '' }}</div>
              @if (e.fundraisingTarget) {
                <div class="raise">
                  <div class="raise-line"><span>Raised {{ e.amountRaised | number:'1.2-2' }}</span><span>Target {{ e.fundraisingTarget | number:'1.2-2' }}</span></div>
                  <div class="progress-track"><div class="progress-fill" [style.width.%]="raisedPct(e)"></div></div>
                </div>
              }
              <div class="event-foot">
                <button class="btn-outline btn-sm" (click)="toggleEvent(e)">{{ e.status==='upcoming'?'Complete':'Reopen' }}</button>
              </div>
            </article>
          } @empty { <div class="empty-cell"><span class="empty-icon">✦</span><strong>No events</strong><span>Use “+ Event” to plan the first one.</span></div> }
        </div>
      }

      @if (tab() === 'fundraising') {
        <div class="panel-head">
          <div><h3>Donations</h3><p>Gifts from alumni, with the event they supported.</p></div>
          <div class="actions"><button class="btn-primary" (click)="showDonationForm=!showDonationForm">+ Record donation</button></div>
        </div>
        @if (showDonationForm) {
          <div class="form-panel">
            <h4>Record donation</h4>
            <div class="fields">
              <div class="field"><label>Alumni</label><select [(ngModel)]="donation.alumniId"><option value="">Alumni…</option>@for (a of alumni; track a.id) { <option [value]="a.id">{{ a.firstName }} {{ a.lastName }}</option> }</select></div>
              <div class="field"><label>Event (optional)</label><select [(ngModel)]="donation.eventId"><option value="">Event (optional)…</option>@for (e of events; track e.id) { <option [value]="e.id">{{ e.title }}</option> }</select></div>
              <div class="field"><label>Amount *</label><input [(ngModel)]="donation.amount" type="number" placeholder="0.00" /></div>
              <div class="field"><label>Method</label><select [(ngModel)]="donation.method"><option value="cash">Cash</option><option value="bank">Bank</option><option value="ecocash">EcoCash</option><option value="onemoney">OneMoney</option><option value="innbucks">InnBucks</option><option value="other">Other</option></select></div>
              <div class="field"><label>Date</label><input [(ngModel)]="donation.date" type="date" /></div>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="saveDonation()">Record</button><button class="btn-outline" (click)="showDonationForm=false">Cancel</button></div>
          </div>
        }
        <div class="table-wrap">
          <table class="data-table"><thead><tr><th>Date</th><th>Alumni</th><th class="num">Amount</th><th>Method</th><th>Event</th></tr></thead><tbody>
            @for (d of donations; track d.id) {
              <tr><td>{{ d.date }}</td><td class="name-cell">{{ d.alumni?.firstName }} {{ d.alumni?.lastName }}</td><td class="num"><b>{{ d.amount | number:'1.2-2' }}</b></td><td><span class="pill cat">{{ d.method }}</span></td><td [class.muted]="eventName(d)==='—'">{{ eventName(d) }}</td></tr>
            } @empty { <tr><td colspan="5" class="empty-cell"><span class="empty-icon">◈</span><strong>No donations yet</strong><span>Recorded gifts will appear here.</span></td></tr> }
          </tbody></table>
        </div>
      }

    </div>
  </div>
</div>
</app-portal-layout>`,
  styleUrl: './admin-alumni.component.scss',
})
export class AdminAlumniComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  tabs = TABS;
  tab = signal('directory');

  alumni: Alumni[] = [];
  events: AlumniEvent[] = [];
  donations: Donation[] = [];
  search = '';
  showAlumniForm = false; showEventForm = false; showDonationForm = false;
  alumniForm: any = {}; event: any = { type: 'reunion' }; donation: any = { method: 'cash', date: new Date().toISOString().slice(0, 10) };

  ngOnInit() { this.loadAll(); }

  // ── Presentation helpers (read-only; no behaviour change) ──
  get upcomingCount(): number { return this.events.filter((e) => e.status === 'upcoming').length; }
  get totalDonated(): number { return this.donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0); }
  tabCount(key: string): number {
    return key === 'directory' ? this.alumni.length : key === 'events' ? this.events.length : key === 'fundraising' ? this.donations.length : 0;
  }
  initials(a: Alumni): string { return `${(a.firstName || '')[0] || ''}${(a.lastName || '')[0] || ''}`.toUpperCase() || '?'; }
  raisedPct(e: AlumniEvent): number {
    const t = Number(e.fundraisingTarget) || 0;
    return t > 0 ? Math.min(100, Math.round(((Number(e.amountRaised) || 0) / t) * 100)) : 0;
  }

  loadAll() {
    this.loadDirectory();
    this.api.get<AlumniEvent[]>('/alumni/events').subscribe({ next: (r) => (this.events = r || []), error: () => {} });
    this.api.get<Donation[]>('/alumni/donations').subscribe({ next: (r) => (this.donations = r || []), error: () => {} });
  }

  loadDirectory() {
    const p: any = {};
    if (this.search) p.q = this.search;
    this.api.get<Alumni[]>('/alumni/directory', p).subscribe({ next: (r) => (this.alumni = r || []), error: () => {} });
  }

  saveAlumni() {
    if (!this.alumniForm.firstName || !this.alumniForm.lastName) return;
    this.api.post('/alumni/directory', this.alumniForm).subscribe({
      next: () => { this.showAlumniForm = false; this.alumniForm = {}; this.loadDirectory(); }, error: () => {},
    });
  }

  syncGraduated() {
    this.api.post<any>('/alumni/directory/sync-graduated', {}).subscribe({ next: (r) => { this.loadDirectory(); }, error: () => {} });
  }

  saveEvent() {
    if (!this.event.title) return;
    this.api.post('/alumni/events', this.event).subscribe({
      next: () => { this.showEventForm = false; this.event = { type: 'reunion' }; this.loadAll(); }, error: () => {},
    });
  }

  toggleEvent(e: AlumniEvent) {
    this.api.patch(`/alumni/events/${e.id}`, { status: e.status === 'upcoming' ? 'completed' : 'upcoming' }).subscribe({ next: () => this.loadAll(), error: () => {} });
  }

  saveDonation() {
    if (!this.donation.alumniId || !this.donation.amount) return;
    this.api.post('/alumni/donations', this.donation).subscribe({
      next: () => { this.showDonationForm = false; this.donation = { method: 'cash', date: new Date().toISOString().slice(0, 10) }; this.loadAll(); },
      error: () => {},
    });
  }

  eventName(d: Donation) { return this.events.find((e) => e.id === (d as any).eventId)?.title || '—'; }
}
