import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { DashboardOverview } from '../../core/models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, RouterLink],
  template: `
    <app-portal-layout portalTitle="Admin Portal" pageTitle="Administration"
      [navSections]="adminNav">
      <div class="stats-grid">
        <div class="stat-card blue"><span class="stat-value">{{ overview()?.totalStudents }}</span><span class="stat-label">Students</span></div>
        <div class="stat-card purple"><span class="stat-value">{{ overview()?.totalStaff }}</span><span class="stat-label">Staff</span></div>
        <div class="stat-card green"><span class="stat-value">{{ '$' + (overview()?.monthlyCollections | number:'1.2-2') }}</span><span class="stat-label">Collections</span></div>
        <div class="stat-card orange"><span class="stat-value">{{ '$' + (overview()?.totalDebtors | number:'1.2-2') }}</span><span class="stat-label">Debtors</span></div>
      </div>
      <div class="quick-actions card">
        <h3>Quick Actions</h3>
        <div class="action-grid">
          <a routerLink="/admin/students" class="action-btn">+ Register Student</a>
          <a routerLink="/admin/enrollment" class="action-btn">Class Enrollment</a>
          <a routerLink="/admin/billing" class="action-btn">Record Payment</a>
          <a routerLink="/admin/staff" class="action-btn">Staff Management</a>
          <a routerLink="/admin/attendance/mark-register" class="action-btn">Mark Register</a>
          <a routerLink="/admin/attendance/report" class="action-btn">Attendance Report</a>
          <a routerLink="/admin/exams" class="action-btn">Enter Exam Marks</a>
          <a routerLink="/admin/mark-sheet" class="action-btn">Mark Sheet</a>
          <a routerLink="/admin/report-cards" class="action-btn">Report Cards</a>
          <a routerLink="/admin/settings" class="action-btn">School Year / Terms</a>
        </div>
      </div>
    </app-portal-layout>
  `,
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  overview = signal<DashboardOverview | null>(null);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  ngOnInit() {
    this.api.get<DashboardOverview>('/dashboard/overview').subscribe((d) => this.overview.set(d));
  }
}
