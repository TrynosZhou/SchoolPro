import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  template: `
    <app-portal-layout portalTitle="Teacher Portal" pageTitle="My Classes" [navSections]="teacherNav">
      <div class="card">
        <h3>Assigned Classes</h3>
        @for (c of classes(); track c.id) {
          <div class="class-chip">{{ c.name }}</div>
        }
      </div>
      <div class="quick-actions card">
        <h3>Teaching Tools</h3>
        <div class="action-grid">
          <a routerLink="/teacher/class-list" class="action-btn">Class List</a>
          <a routerLink="/teacher/attendance/mark-register" class="action-btn">Mark Register</a>
          <a routerLink="/teacher/attendance/report" class="action-btn">Attendance Report</a>
          <a routerLink="/teacher/exams" class="action-btn">Enter Exam Marks</a>
          <a routerLink="/teacher/assessments" class="action-btn">Weekly Assessments</a>
          <a routerLink="/teacher/schedules" class="action-btn">Learning Schedules</a>
          <a routerLink="/teacher/timetable" class="action-btn">Timetable</a>
          <a routerLink="/teacher/messages" class="action-btn">Message Parents</a>
        </div>
      </div>
    </app-portal-layout>
  `,
})
export class TeacherDashboardComponent implements OnInit {
  private api = inject(ApiService);
  classes = signal<{ id: string; name: string }[]>([]);
  readonly teacherNav = TEACHER_NAV_SECTIONS;

  ngOnInit() {
    this.api.get<{ assignedClasses: { id: string; name: string }[] }>('/dashboard/teacher')
      .subscribe((d) => this.classes.set(d.assignedClasses || []));
  }
}
