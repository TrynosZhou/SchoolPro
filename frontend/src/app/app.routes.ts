import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { DirectorDashboardComponent } from './pages/director/director-dashboard.component';
import { DirectorFinanceComponent } from './pages/director/director-finance.component';
import { AdminFinanceComponent } from './pages/admin/admin-finance.component';
import { AdminDashboardComponent } from './pages/admin/admin-dashboard.component';
import { AdminStudentsComponent } from './pages/admin/admin-students.component';
import { AdminBillingComponent } from './pages/admin/admin-billing.component';
import { AdminSettingsComponent } from './pages/admin/admin-settings.component';
import { AdminEnrollmentComponent } from './pages/admin/admin-enrollment.component';
import { ClassListComponent } from './pages/students/class-list.component';
import { AdminReportCardsComponent } from './pages/admin/admin-report-cards.component';
import { AdminStaffComponent } from './pages/admin/admin-staff.component';
import { TeacherDashboardComponent } from './pages/teacher/teacher-dashboard.component';
import { TeacherExamsComponent } from './pages/teacher/teacher-exams.component';
import { ExamMarksEntryComponent } from './pages/exams/exam-marks-entry.component';
import { ParentDashboardComponent } from './pages/parent/parent-dashboard.component';
import { ParentFinanceComponent } from './pages/parent/parent-finance.component';
import { ParentReportCardComponent } from './pages/parent/parent-report-card.component';
import { AttendanceMarkRegisterComponent } from './pages/attendance/attendance-mark-register.component';
import { AttendanceReportComponent } from './pages/attendance/attendance-report.component';
import { AdminMarkSheetComponent } from './pages/admin/admin-mark-sheet.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },

  {
    path: 'director',
    canActivate: [authGuard, roleGuard('director')],
    children: [
      { path: '', component: DirectorDashboardComponent },
      { path: 'finance', component: DirectorFinanceComponent },
      { path: 'attendance', component: DirectorDashboardComponent },
      { path: 'academics', component: DirectorDashboardComponent },
      { path: 'store', component: DirectorDashboardComponent },
    ],
  },
  {
    path: 'principal',
    canActivate: [authGuard, roleGuard('principal')],
    children: [
      { path: '', component: DirectorDashboardComponent },
      { path: 'finance', component: DirectorFinanceComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      { path: '', component: AdminDashboardComponent },
      { path: 'students', component: AdminStudentsComponent },
      { path: 'enrollment', component: AdminEnrollmentComponent },
      { path: 'class-list', component: ClassListComponent },
      { path: 'billing', component: AdminBillingComponent },
      { path: 'finance', component: AdminFinanceComponent },
      { path: 'staff', component: AdminStaffComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'attendance', redirectTo: 'attendance/mark-register', pathMatch: 'full' },
      { path: 'attendance/mark-register', component: AttendanceMarkRegisterComponent },
      { path: 'attendance/report', component: AttendanceReportComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'classes', component: AdminDashboardComponent },
      { path: 'staff-attendance', redirectTo: 'staff', pathMatch: 'full' },
      { path: 'settings', component: AdminSettingsComponent },
    ],
  },
  {
    path: 'teacher',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      { path: '', component: TeacherDashboardComponent },
      { path: 'exams', component: TeacherExamsComponent },
      { path: 'attendance', redirectTo: 'attendance/mark-register', pathMatch: 'full' },
      { path: 'attendance/mark-register', component: AttendanceMarkRegisterComponent },
      { path: 'attendance/report', component: AttendanceReportComponent },
      { path: 'enrollment', component: AdminEnrollmentComponent },
      { path: 'class-list', component: ClassListComponent },
      { path: 'assessments', component: TeacherDashboardComponent },
      { path: 'schedules', component: TeacherDashboardComponent },
      { path: 'timetable', component: TeacherDashboardComponent },
      { path: 'messages', component: TeacherDashboardComponent },
    ],
  },
  {
    path: 'parent',
    canActivate: [authGuard, roleGuard('parent', 'student')],
    children: [
      { path: '', component: ParentDashboardComponent },
      { path: 'finance', component: ParentFinanceComponent },
      { path: 'finance/:studentId', component: ParentFinanceComponent },
      { path: 'attendance/:studentId', component: ParentDashboardComponent },
      { path: 'report-card/:studentId', component: ParentReportCardComponent },
      { path: 'report-cards', component: ParentDashboardComponent },
      { path: 'messages', component: ParentDashboardComponent },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
