import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { ApplyComponent } from './pages/public/apply.component';
import { ApplicationStatusComponent } from './pages/public/application-status.component';
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
import { AdminStaffAttendanceComponent } from './pages/admin/admin-staff-attendance.component';
import { AdminClassAssignmentsComponent } from './pages/admin/admin-class-assignments.component';
import { TeacherDashboardComponent } from './pages/teacher/teacher-dashboard.component';
import { TeacherExamsComponent } from './pages/teacher/teacher-exams.component';
import { ExamMarksEntryComponent } from './pages/exams/exam-marks-entry.component';
import { ParentDashboardComponent } from './pages/parent/parent-dashboard.component';
import { ParentFinanceComponent } from './pages/parent/parent-finance.component';
import { ParentReportCardComponent } from './pages/parent/parent-report-card.component';
import { ParentReportCardsComponent } from './pages/parent/parent-report-cards.component';
import { ParentSendEmailComponent } from './pages/parent/parent-send-email.component';
import { MessagingCenterComponent } from './shared/messaging/messaging-center.component';
import { NotificationsComponent } from './shared/notifications/notifications.component';
import { AdminBulkMessageComponent } from './pages/admin/admin-bulk-message.component';
import { AdminNotificationSettingsComponent } from './pages/admin/admin-notification-settings.component';
import { ParentAttendanceComponent } from './pages/parent/parent-attendance.component';
import { AttendanceMarkRegisterComponent } from './pages/attendance/attendance-mark-register.component';
import { AttendanceReportComponent } from './pages/attendance/attendance-report.component';
import { AdminMarkSheetComponent } from './pages/admin/admin-mark-sheet.component';
import { AdminResultsAnalysisComponent } from './pages/admin/admin-results-analysis.component';
import { AdminRankingComponent } from './pages/admin/admin-ranking.component';
import { AdminManageFeesComponent } from './pages/admin/admin-manage-fees.component';
import { AdminStudentBalanceComponent } from './pages/admin/admin-student-balance.component';
import { AdminExemptionsComponent } from './pages/admin/admin-exemptions.component';
import { AdminAcademicSettingsComponent } from './pages/admin/admin-academic-settings.component';
import { AdminIntegrationsComponent } from './pages/admin/admin-integrations.component';
import { AdminUserPermissionsComponent } from './pages/admin/admin-user-permissions.component';
import { AdminUserManagementComponent } from './pages/admin/admin-user-management.component';
import { AdminClassPromotionComponent } from './pages/admin/admin-class-promotion.component';
import { AdminStudentLedgerComponent } from './pages/admin/admin-student-ledger.component';
import { AdminOutstandingInvoicesComponent } from './pages/admin/admin-outstanding-invoices.component';
import { AdminRecordPaymentComponent } from './pages/admin/admin-record-payment.component';
import { AdminStudentReconciliationComponent } from './pages/admin/admin-student-reconciliation.component';
import { AdminDebtorAgingComponent } from './pages/admin/admin-debtor-aging.component';
import { AdminFeeCollectionRevenueComponent } from './pages/admin/admin-fee-collection-revenue.component';
import { AdminTimetableConfigurePeriodsComponent } from './pages/admin/admin-timetable-configure-periods.component';
import { AdminTimetableGenerateComponent } from './pages/admin/admin-timetable-generate.component';
import { AdminTimetableViewComponent } from './pages/admin/admin-timetable-view.component';
import { AdminTimetableTeacherScheduleComponent } from './pages/admin/admin-timetable-teacher-schedule.component';
import { AdminSendMessageComponent } from './pages/admin/admin-send-message.component';
import { AdminInboxComponent } from './pages/admin/admin-inbox.component';
import { AdminParentsComponent } from './pages/admin/admin-parents.component';
import { AdminParentDetailComponent } from './pages/admin/admin-parent-detail.component';
import { AdminPayrollComponent } from './pages/admin/admin-payroll.component';
import { AdminGeneralLedgerComponent } from './pages/admin/admin-general-ledger.component';
import { AdminAdmissionsComponent } from './pages/admin/admin-admissions.component';
import { AdminAnalyticsDemographicsComponent } from './pages/admin/admin-analytics-demographics.component';
import { AdminAnalyticsRetentionComponent } from './pages/admin/admin-analytics-retention.component';
import { AdminReportBuilderComponent } from './pages/admin/admin-report-builder.component';
import { AdminAuditTrailComponent } from './pages/admin/admin-audit-trail.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'apply', component: ApplyComponent },
  { path: 'apply/status', component: ApplicationStatusComponent },
  { path: 'admissions', redirectTo: 'apply', pathMatch: 'full' },
  { path: 'admissions/status', redirectTo: 'apply/status', pathMatch: 'full' },

  {
    path: 'director',
    canActivate: [authGuard, roleGuard('director')],
    children: [
      { path: '', component: DirectorDashboardComponent },
      { path: 'finance', component: DirectorFinanceComponent },
      { path: 'attendance', component: AttendanceReportComponent },
      { path: 'academics', component: DirectorAcademicsComponent },
      { path: 'store', component: DirectorStoreComponent },
      { path: 'payroll', component: AdminPayrollComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
      { path: 'analytics/demographics', component: AdminAnalyticsDemographicsComponent },
      { path: 'analytics/retention', component: AdminAnalyticsRetentionComponent },
      { path: 'analytics/report-builder', component: AdminReportBuilderComponent },
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
      { path: 'payroll', component: AdminPayrollComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
      { path: 'analytics/demographics', component: AdminAnalyticsDemographicsComponent },
      { path: 'analytics/retention', component: AdminAnalyticsRetentionComponent },
      { path: 'analytics/report-builder', component: AdminReportBuilderComponent },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      { path: '', component: AdminDashboardComponent },
      { path: 'students', component: AdminStudentsComponent },
      { path: 'admissions', component: AdminAdmissionsComponent },
      { path: 'parents', component: AdminParentsComponent },
      { path: 'parents/:id', component: AdminParentDetailComponent },
      { path: 'enrollment', component: AdminEnrollmentComponent },
      { path: 'class-list', component: ClassListComponent },
      { path: 'class-promotion', component: AdminClassPromotionComponent },
      { path: 'billing', component: AdminBillingComponent, data: { financeMode: 'billing' } },
      { path: 'payment', component: AdminBillingComponent, data: { financeMode: 'payment' } },
      { path: 'manage-fees', component: AdminManageFeesComponent },
      { path: 'student-balance', component: AdminStudentBalanceComponent },
      { path: 'exemptions', component: AdminExemptionsComponent },
      { path: 'finance', component: AdminFinanceComponent },
      { path: 'fin-reports/student-ledger', component: AdminStudentLedgerComponent },
      { path: 'fin-reports/outstanding-invoices', component: AdminOutstandingInvoicesComponent },
      { path: 'fin-reports/record-payment/:studentId', component: AdminRecordPaymentComponent },
      { path: 'fin-reports/student-reconciliation', component: AdminStudentReconciliationComponent },
      { path: 'fin-reports/debtor-aging', component: AdminDebtorAgingComponent },
      { path: 'fin-reports/fee-collection-revenue', component: AdminFeeCollectionRevenueComponent },
      { path: 'fin-reports/general-ledger', component: AdminGeneralLedgerComponent },
      { path: 'communication/send', component: AdminSendMessageComponent },
      { path: 'communication/inbox', component: AdminInboxComponent },
      { path: 'communication/bulk', component: AdminBulkMessageComponent },
      { path: 'communication/notifications', component: NotificationsComponent },
      { path: 'communication/notification-settings', component: AdminNotificationSettingsComponent },
      { path: 'timetable', redirectTo: 'timetable/configure-periods', pathMatch: 'full' },
      { path: 'timetable/configure-periods', component: AdminTimetableConfigurePeriodsComponent },
      { path: 'timetable/generate', component: AdminTimetableGenerateComponent },
      { path: 'timetable/view', component: AdminTimetableViewComponent },
      { path: 'timetable/teacher-schedule', component: AdminTimetableTeacherScheduleComponent },
      { path: 'staff', component: AdminStaffComponent },
      { path: 'payroll', component: AdminPayrollComponent },
      { path: 'exams', component: ExamMarksEntryComponent },
      { path: 'attendance', redirectTo: 'attendance/mark-register', pathMatch: 'full' },
      { path: 'attendance/mark-register', component: AttendanceMarkRegisterComponent },
      { path: 'attendance/report', component: AttendanceReportComponent },
      { path: 'report-cards', component: AdminReportCardsComponent },
      { path: 'mark-sheet', component: AdminMarkSheetComponent },
      { path: 'results-analysis', component: AdminResultsAnalysisComponent },
      { path: 'ranking', component: AdminRankingComponent },
      { path: 'analytics/demographics', component: AdminAnalyticsDemographicsComponent },
      { path: 'analytics/retention', component: AdminAnalyticsRetentionComponent },
      { path: 'analytics/report-builder', component: AdminReportBuilderComponent },
      { path: 'classes', component: AdminDashboardComponent },
      { path: 'staff-attendance', component: AdminStaffAttendanceComponent },
      { path: 'class-assignments', component: AdminClassAssignmentsComponent },
      { path: 'settings', component: AdminSettingsComponent },
      { path: 'academic-settings', component: AdminAcademicSettingsComponent },
      { path: 'user-management', component: AdminUserManagementComponent },
      { path: 'user-permissions', component: AdminUserPermissionsComponent },
      { path: 'audit-trail', component: AdminAuditTrailComponent },
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
      { path: 'messages', component: MessagingCenterComponent },
      { path: 'notifications', component: NotificationsComponent },
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
      { path: 'messages', component: MessagingCenterComponent },
      { path: 'notifications', component: NotificationsComponent },
      { path: 'send-email', component: ParentSendEmailComponent },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
