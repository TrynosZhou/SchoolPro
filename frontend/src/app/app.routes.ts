import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { DirectorDashboardComponent } from './pages/director/director-dashboard.component';
import { DirectorFinanceComponent } from './pages/director/director-finance.component';
import { DirectorAcademicsComponent } from './pages/director/director-academics.component';
import { DirectorStoreComponent } from './pages/director/director-store.component';
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
import { ParentReportCardsComponent } from './pages/parent/parent-report-cards.component';
import { ParentMessagesComponent } from './pages/parent/parent-messages.component';
import { ParentAttendanceComponent } from './pages/parent/parent-attendance.component';
import { AttendanceMarkRegisterComponent } from './pages/attendance/attendance-mark-register.component';
import { AttendanceReportComponent } from './pages/attendance/attendance-report.component';
import { AdminMarkSheetComponent } from './pages/admin/admin-mark-sheet.component';
import { AdminResultsAnalysisComponent } from './pages/admin/admin-results-analysis.component';
import { AdminRankingComponent } from './pages/admin/admin-ranking.component';
import { AdminManageFeesComponent } from './pages/admin/admin-manage-fees.component';
import { AdminStudentBalanceComponent } from './pages/admin/admin-student-balance.component';
import { AdminAcademicSettingsComponent } from './pages/admin/admin-academic-settings.component';
import { AdminIntegrationsComponent } from './pages/admin/admin-integrations.component';
import { AdminUserPermissionsComponent } from './pages/admin/admin-user-permissions.component';
import { AdminUserManagementComponent } from './pages/admin/admin-user-management.component';
import { AdminClassPromotionComponent } from './pages/admin/admin-class-promotion.component';
import { AdminStudentLedgerComponent } from './pages/admin/admin-student-ledger.component';
import { AdminOutstandingInvoicesComponent } from './pages/admin/admin-outstanding-invoices.component';
import { AdminStudentReconciliationComponent } from './pages/admin/admin-student-reconciliation.component';
import { AdminDebtorAgingComponent } from './pages/admin/admin-debtor-aging.component';
import { AdminFeeCollectionRevenueComponent } from './pages/admin/admin-fee-collection-revenue.component';
import { AdminTimetableConfigurePeriodsComponent } from './pages/admin/admin-timetable-configure-periods.component';
import { AdminTimetableGenerateComponent } from './pages/admin/admin-timetable-generate.component';
import { AdminTimetableViewComponent } from './pages/admin/admin-timetable-view.component';
import { AdminSendMessageComponent } from './pages/admin/admin-send-message.component';
import { AdminInboxComponent } from './pages/admin/admin-inbox.component';
import { AdminParentsComponent } from './pages/admin/admin-parents.component';
import { AdminParentDetailComponent } from './pages/admin/admin-parent-detail.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },

  {
    path: 'director',
    canActivate: [authGuard, roleGuard('director')],
    children: [
      { path: '', component: DirectorDashboardComponent },
      { path: 'finance', component: DirectorFinanceComponent },
      { path: 'attendance', component: AttendanceReportComponent },
      { path: 'academics', component: DirectorAcademicsComponent },
      { path: 'store', component: DirectorStoreComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
    ],
  },
  {
    path: 'principal',
    canActivate: [authGuard, roleGuard('principal')],
    children: [
      { path: '', component: DirectorDashboardComponent },
      { path: 'finance', component: DirectorFinanceComponent },
      { path: 'attendance', component: AttendanceReportComponent },
      { path: 'academics', component: DirectorAcademicsComponent },
      { path: 'store', component: DirectorStoreComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      { path: '', component: AdminDashboardComponent },
      { path: 'students', component: AdminStudentsComponent },
      { path: 'parents', component: AdminParentsComponent },
      { path: 'parents/:id', component: AdminParentDetailComponent },
      { path: 'enrollment', component: AdminEnrollmentComponent },
      { path: 'class-list', component: ClassListComponent },
      { path: 'class-promotion', component: AdminClassPromotionComponent },
      { path: 'billing', component: AdminBillingComponent },
      { path: 'manage-fees', component: AdminManageFeesComponent },
      { path: 'student-balance', component: AdminStudentBalanceComponent },
      { path: 'finance', component: AdminFinanceComponent },
      { path: 'fin-reports/student-ledger', component: AdminStudentLedgerComponent },
      { path: 'fin-reports/outstanding-invoices', component: AdminOutstandingInvoicesComponent },
      { path: 'fin-reports/student-reconciliation', component: AdminStudentReconciliationComponent },
      { path: 'fin-reports/debtor-aging', component: AdminDebtorAgingComponent },
      { path: 'fin-reports/fee-collection-revenue', component: AdminFeeCollectionRevenueComponent },
      { path: 'communication/send', component: AdminSendMessageComponent },
      { path: 'communication/inbox', component: AdminInboxComponent },
      { path: 'timetable', redirectTo: 'timetable/configure-periods', pathMatch: 'full' },
      { path: 'timetable/configure-periods', component: AdminTimetableConfigurePeriodsComponent },
      { path: 'timetable/generate', component: AdminTimetableGenerateComponent },
      { path: 'timetable/view', component: AdminTimetableViewComponent },
      { path: 'staff', component: AdminStaffComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'attendance', redirectTo: 'attendance/mark-register', pathMatch: 'full' },
      { path: 'attendance/mark-register', component: AttendanceMarkRegisterComponent },
      { path: 'attendance/report', component: AttendanceReportComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
      { path: 'classes', component: AdminDashboardComponent },
      { path: 'staff-attendance', redirectTo: 'staff', pathMatch: 'full' },
      { path: 'settings', component: AdminSettingsComponent },
      { path: 'academic-settings', component: AdminAcademicSettingsComponent },
      { path: 'user-management', component: AdminUserManagementComponent },
      { path: 'user-permissions', component: AdminUserPermissionsComponent },
      { path: 'integrations', component: AdminIntegrationsComponent },
    ],
  },
  {
    path: 'teacher',
    canActivate: [authGuard, roleGuard('teacher')],
    children: [
      { path: '', component: TeacherDashboardComponent },
      { path: 'exams', component: TeacherExamsComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
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
      { path: 'attendance', component: ParentAttendanceComponent },
      { path: 'report-card/:studentId', component: ParentReportCardComponent },
      { path: 'report-cards', component: ParentReportCardsComponent },
      { path: 'messages', component: ParentMessagesComponent },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
