import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';

interface Student { id: string; firstName: string; lastName: string }
interface Leave { id: string; studentId: string; studentName?: string; date: string; time: string; reason?: string; status: string; decisionNote?: string }

@Component({
  selector: 'app-parent-early-leave',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  template: `
<app-portal-layout portalTitle="Parent Portal" pageTitle="Early Leave Request" [navItems]="nav">
<div class="grid-2">
  <div class="card">
    <h3>Request early leave</h3>
    <p style="color:#555;font-size:.9rem">Submit a request for your child to leave school early. The gate team will approve or reject it.</p>
    <div class="form-grid">
      <select [(ngModel)]="form.studentId"><option value="">Select child…</option>
        @for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }
      </select>
      <input [(ngModel)]="form.date" type="date" title="Date" />
      <input [(ngModel)]="form.time" type="time" title="Departure time" />
      <input [(ngModel)]="form.reason" placeholder="Reason" />
    </div>
    <div class="toolbar" style="margin-top:.75rem">
      <button class="btn-primary" (click)="submit()" [disabled]="saving">Submit request</button>
    </div>
    @if (msg) { <p class="success">{{ msg }}</p> }
    @if (err) { <p class="error">{{ err }}</p> }
  </div>
  <div class="card">
    <h3>My requests</h3>
    <table class="data-table"><thead><tr><th>Date</th><th>Time</th><th>Child</th><th>Reason</th><th>Status</th></tr></thead><tbody>
      @for (l of leaves; track l.id) {
        <tr><td>{{ l.date }}</td><td>{{ l.time }}</td><td>{{ l.studentName || l.studentId }}</td>
          <td>{{ l.reason || '—' }}</td><td><span class="badge">{{ l.status }}</span></td></tr>
      } @empty { <tr><td colspan="5">No requests yet</td></tr> }
    </tbody></table>
  </div>
</div>
</app-portal-layout>`,
})
export class ParentEarlyLeaveComponent implements OnInit {
  private api = inject(ApiService);
  readonly nav = PARENT_NAV_ITEMS;

  students: Student[] = [];
  leaves: Leave[] = [];
  form: any = { date: new Date().toISOString().slice(0, 10) };
  saving = false;
  msg = '';
  err = '';

  ngOnInit() {
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
    this.load();
  }

  load() {
    this.api.get<Leave[]>('/gate/early-leave').subscribe({ next: (r) => (this.leaves = r || []), error: () => {} });
  }

  submit() {
    if (!this.form.studentId || !this.form.date || !this.form.time) { this.err = 'Child, date and time are required.'; return; }
    this.saving = true; this.msg = ''; this.err = '';
    this.api.post('/gate/early-leave', this.form).subscribe({
      next: () => { this.saving = false; this.msg = 'Request submitted.'; this.form = { date: new Date().toISOString().slice(0, 10) }; this.load(); },
      error: (e) => { this.saving = false; this.err = e?.error?.message || 'Could not submit request.'; },
    });
  }
}
