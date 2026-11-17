import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Activity { id: string; name: string; type: string; coachName?: string; memberCount: number; isActive: boolean; description?: string }
interface Member { id: string; studentId: string; studentName?: string; role: string }
interface PointRow { id: string; studentId: string; studentName?: string; activityId?: string; points: number; reason: string; date: string }
interface Competition { id: string; name: string; date?: string; location?: string; status: string; activity?: Activity; results?: any[] }
interface House { id: string; name: string; color?: string; motto?: string }
interface Student { id: string; firstName: string; lastName: string }

const TABS = [
  { key: 'activities', label: 'Activities' },
  { key: 'members', label: 'Members' },
  { key: 'points', label: 'Points' },
  { key: 'competitions', label: 'Competitions' },
];

@Component({
  selector: 'app-admin-activities',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Co-Curricular" [navSections]="adminNav">
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    @for (t of tabs; track t.key) {
      <button class="btn-outline" [style.fontWeight]="tab()===t.key?'700':'400'" (click)="tab.set(t.key)">{{ t.label }}</button>
    }
  </div>

  @if (tab() === 'activities') {
    <div class="toolbar" style="margin-bottom:1rem">
      <button class="btn-primary" (click)="showActivityForm=!showActivityForm">+ Activity</button>
      <button class="btn-outline" (click)="showHouseForm=!showHouseForm">+ House</button>
    </div>
    @if (showActivityForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="activity.name" placeholder="Name *" />
        <select [(ngModel)]="activity.type"><option value="sport">Sport</option><option value="club">Club</option><option value="society">Society</option><option value="other">Other</option></select>
        <input [(ngModel)]="activity.description" placeholder="Description" />
        <button class="btn-primary" (click)="saveActivity()">Save</button>
      </div>
    }
    @if (showHouseForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="house.name" placeholder="House name" /><input [(ngModel)]="house.color" placeholder="Color" /><input [(ngModel)]="house.motto" placeholder="Motto" />
        <button class="btn-primary" (click)="saveHouse()">Save</button>
      </div>
    }
    <div class="grid-2">
      <table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Coach</th><th>Members</th></tr></thead><tbody>
        @for (a of activities; track a.id) {
          <tr><td>{{ a.name }}</td><td>{{ a.type }}</td><td>{{ a.coachName || '—' }}</td><td>{{ a.memberCount }}</td></tr>
        } @empty { <tr><td colspan="4">No activities</td></tr> }
      </tbody></table>
      <table class="data-table"><thead><tr><th>House</th><th>Color</th><th>Motto</th></tr></thead><tbody>
        @for (h of houses; track h.id) { <tr><td>{{ h.name }}</td><td>{{ h.color || '—' }}</td><td>{{ h.motto || '—' }}</td></tr> }
        @empty { <tr><td colspan="3">No houses</td></tr> }
      </tbody></table>
    </div>
  }

  @if (tab() === 'members') {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="memberActivity"><option value="">Activity…</option>@for (a of activities; track a.id) { <option [value]="a.id">{{ a.name }}</option> }</select>
      <button class="btn-primary" (click)="loadMembers()" [disabled]="!memberActivity">Load members</button>
      <button class="btn-outline" (click)="showMemberForm=!showMemberForm">+ Enrol</button>
    </div>
    @if (showMemberForm && memberActivity) {
      <div class="form-grid" style="margin-bottom:1rem">
        <select [(ngModel)]="member.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
        <select [(ngModel)]="member.role"><option value="member">Member</option><option value="captain">Captain</option></select>
        <button class="btn-primary" (click)="saveMember()">Enrol</button>
      </div>
    }
    <table class="data-table"><thead><tr><th>Student</th><th>Role</th><th></th></tr></thead><tbody>
      @for (m of members; track m.id) {
        <tr><td>{{ m.studentName }}</td><td>{{ m.role }}</td>
          <td><button class="btn-outline" (click)="removeMember(m)">Remove</button></td></tr>
      } @empty { <tr><td colspan="3">Select an activity to view members</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'points') {
    <div class="toolbar" style="margin-bottom:1rem">
      <button class="btn-primary" (click)="showPointForm=!showPointForm">+ Award points</button>
      <button class="btn-outline" (click)="loadLeaderboard()">Leaderboard</button>
    </div>
    @if (showPointForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <select [(ngModel)]="point.studentId"><option value="">Student…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
        <select [(ngModel)]="point.activityId"><option value="">Activity…</option>@for (a of activities; track a.id) { <option [value]="a.id">{{ a.name }}</option> }</select>
        <input [(ngModel)]="point.points" type="number" placeholder="Points" />
        <input [(ngModel)]="point.date" type="date" />
        <input [(ngModel)]="point.reason" placeholder="Reason" />
        <button class="btn-primary" (click)="savePoint()">Award</button>
      </div>
    }
    @if (leaderboard.length) {
      <h3>Leaderboard</h3>
      <table class="data-table"><thead><tr><th>#</th><th>Student</th><th>Points</th></tr></thead><tbody>
        @for (l of leaderboard; track l.studentId) { <tr><td>{{ l.rank }}</td><td>{{ l.studentName }}</td><td>{{ l.total }}</td></tr> }
      </tbody></table>
    }
    <h3>Recent points</h3>
    <table class="data-table"><thead><tr><th>Date</th><th>Student</th><th>Points</th><th>Reason</th></tr></thead><tbody>
      @for (p of points; track p.id) { <tr><td>{{ p.date }}</td><td>{{ p.studentName }}</td><td>{{ p.points }}</td><td>{{ p.reason }}</td></tr> }
      @empty { <tr><td colspan="4">No points recorded</td></tr> }
    </tbody></table>
  }

  @if (tab() === 'competitions') {
    <div class="toolbar" style="margin-bottom:1rem"><button class="btn-primary" (click)="showCompForm=!showCompForm">+ Competition</button></div>
    @if (showCompForm) {
      <div class="form-grid" style="margin-bottom:1rem">
        <input [(ngModel)]="comp.name" placeholder="Name *" />
        <select [(ngModel)]="comp.activityId"><option value="">Activity…</option>@for (a of activities; track a.id) { <option [value]="a.id">{{ a.name }}</option> }</select>
        <input [(ngModel)]="comp.date" type="date" /><input [(ngModel)]="comp.location" placeholder="Location" />
        <button class="btn-primary" (click)="saveComp()">Save</button>
      </div>
    }
    @for (c of competitions; track c.id) {
      <div class="card" style="margin-bottom:.75rem">
        <b>{{ c.name }}</b> <span class="badge">{{ c.status }}</span>
        <div>{{ c.date || '—' }}{{ c.location ? ' · ' + c.location : '' }}{{ c.activity ? ' · ' + c.activity.name : '' }}</div>
        @if (c.results?.length) {
          <table class="data-table" style="margin-top:.5rem"><thead><tr><th>Student</th><th>Position</th><th>Points</th></tr></thead><tbody>
            @for (r of c.results; track $index) { <tr><td>{{ r.studentName || r.studentId }}</td><td>{{ r.position }}</td><td>{{ r.pointsAwarded || 0 }}</td></tr> }
          </tbody></table>
        }
        @if (c.status !== 'completed') { <button class="btn-outline" style="margin-top:.5rem" (click)="completeComp(c)">Mark completed</button> }
      </div>
    } @empty { <p>No competitions</p> }
  }
</div>
</app-portal-layout>`,
})
export class AdminActivitiesComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  tabs = TABS;
  tab = signal('activities');

  activities: Activity[] = [];
  houses: House[] = [];
  members: Member[] = [];
  points: PointRow[] = [];
  competitions: Competition[] = [];
  students: Student[] = [];
  leaderboard: any[] = [];

  showActivityForm = false; showHouseForm = false; showMemberForm = false;
  showPointForm = false; showCompForm = false;
  activity: any = { type: 'club' }; house: any = {}; member: any = {}; point: any = {}; comp: any = {};
  memberActivity = '';

  ngOnInit() {
    this.load();
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
  }

  load() {
    this.api.get<Activity[]>('/activities/activities').subscribe({ next: (r) => (this.activities = r || []), error: () => {} });
    this.api.get<House[]>('/activities/houses').subscribe({ next: (r) => (this.houses = r || []), error: () => {} });
    this.api.get<PointRow[]>('/activities/points', { limit: '100' }).subscribe({ next: (r) => (this.points = r || []), error: () => {} });
    this.api.get<Competition[]>('/activities/competitions').subscribe({ next: (r) => (this.competitions = r || []), error: () => {} });
  }

  saveActivity() {
    if (!this.activity.name) return;
    this.api.post('/activities/activities', this.activity).subscribe({ next: () => { this.showActivityForm = false; this.activity = { type: 'club' }; this.load(); }, error: () => {} });
  }

  saveHouse() {
    if (!this.house.name) return;
    this.api.post('/activities/houses', this.house).subscribe({ next: () => { this.showHouseForm = false; this.house = {}; this.load(); }, error: () => {} });
  }

  loadMembers() {
    this.api.get<Member[]>(`/activities/activities/${this.memberActivity}/members`).subscribe({ next: (r) => (this.members = r || []), error: () => {} });
  }

  saveMember() {
    if (!this.memberActivity || !this.member.studentId) return;
    this.api.post('/activities/members', { ...this.member, activityId: this.memberActivity }).subscribe({
      next: () => { this.showMemberForm = false; this.member = {}; this.loadMembers(); this.load(); }, error: () => {},
    });
  }

  removeMember(m: Member) {
    this.api.delete(`/activities/members/${m.id}`).subscribe({ next: () => this.loadMembers(), error: () => {} });
  }

  savePoint() {
    if (!this.point.studentId || !this.point.points || !this.point.reason) return;
    this.api.post('/activities/points', this.point).subscribe({
      next: () => { this.showPointForm = false; this.point = {}; this.load(); }, error: () => {},
    });
  }

  loadLeaderboard() {
    this.api.get<any[]>('/activities/leaderboard').subscribe({ next: (r) => (this.leaderboard = r || []), error: () => {} });
  }

  saveComp() {
    if (!this.comp.name) return;
    this.api.post('/activities/competitions', this.comp).subscribe({ next: () => { this.showCompForm = false; this.comp = {}; this.load(); }, error: () => {} });
  }

  completeComp(c: Competition) {
    this.api.patch(`/activities/competitions/${c.id}`, { status: 'completed' }).subscribe({ next: () => this.load(), error: () => {} });
  }
}
