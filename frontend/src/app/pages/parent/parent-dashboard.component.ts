import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';

interface ParentChildSummary {
  student: { id: string; firstName: string; lastName: string; className?: string; formName?: string };
  balanceOwed: number;
  recentAssessments: { topic: string; score?: number; maxScore?: number; weekStart: string }[];
  attendance: { status: string; count: string }[];
}

@Component({
  selector: 'app-parent-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, RouterLink],
  template: `
    <app-portal-layout portalTitle="Parent Portal" pageTitle="My Children" [navItems]="nav">
      @for (child of children(); track child.student.id) {
        <div class="child-card card">
          <div class="child-header">
            <h3>{{ child.student.firstName }} {{ child.student.lastName }}</h3>
            <span class="badge">{{ child.student.className }} · {{ child.student.formName }}</span>
          </div>
          <div class="child-stats">
            <div class="mini-stat">
              <span class="label">Balance Owed</span>
              <span class="value" [class.text-red]="child.balanceOwed > 0">{{ '$' + (child.balanceOwed | number:'1.2-2') }}</span>
            </div>
            <div class="mini-stat">
              <span class="label">Attendance (30 days)</span>
              @for (a of child.attendance; track a.status) {
                <span>{{ a.status }}: {{ a.count }}</span>
              }
            </div>
          </div>
          <h4>Recent Weekly Assessments</h4>
          <ul class="assessment-list">
            @for (a of child.recentAssessments; track a.weekStart + a.topic) {
              <li>{{ a.topic }} — {{ a.score ?? '-' }}/{{ a.maxScore ?? '-' }} ({{ a.weekStart }})</li>
            } @empty {
              <li>No assessments yet</li>
            }
          </ul>
          <div class="child-actions">
            <a [routerLink]="['/parent/finance', child.student.id]" class="btn-outline">Financial Statement</a>
            <a [routerLink]="['/parent/attendance', child.student.id]" class="btn-outline">Attendance</a>
            <a [routerLink]="['/parent/report-card', child.student.id]" class="btn-outline">Report Card</a>
          </div>
        </div>
      }
    </app-portal-layout>
  `,
})
export class ParentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  children = signal<ParentChildSummary[]>([]);
  nav = [
    { label: 'My Children', path: '/parent', icon: '👨‍👩‍👧' },
    { label: 'Finance', path: '/parent/finance', icon: '💳' },
    { label: 'Attendance', path: '/parent/attendance', icon: '📋' },
    { label: 'Report Cards', path: '/parent/report-cards', icon: '📄' },
    { label: 'Messages', path: '/parent/messages', icon: '💬' },
  ];

  ngOnInit() {
    this.api.get<ParentChildSummary[]>('/dashboard/parent').subscribe((d) => this.children.set(d));
  }
}
