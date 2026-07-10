"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceAdjustment = exports.TuitionExemption = exports.StaffLeaveBalance = exports.Payslip = exports.PayrollRun = exports.StaffPayrollProfile = exports.StudentTermBalance = exports.ResultsPublication = exports.ClassPromotionRule = exports.SchoolFee = exports.SchoolSettings = exports.UniformSale = exports.TuckshopSale = exports.TuckshopItem = exports.Notification = exports.MessageAttachment = exports.Message = exports.WeeklyAssessment = exports.LearningSchedule = exports.TeacherAllocation = exports.Timetable = exports.CashbookEntry = exports.LedgerEntry = exports.Receipt = exports.Payment = exports.InvoiceLine = exports.Invoice = exports.HonourRoll = exports.ReportCard = exports.ExamMark = exports.ExamType = exports.StudentAttendance = exports.StaffAttendance = exports.Staff = exports.Guardian = exports.Student = exports.Parent = exports.TimetableSlot = exports.TeacherAssignment = exports.Section = exports.ClassSubject = exports.Department = exports.Subject = exports.SchoolClass = exports.Form = exports.Term = exports.SchoolYear = exports.SchoolRole = exports.User = exports.entities = void 0;
exports.NotificationLog = exports.HomeworkAssignment = exports.RecordBookMark = exports.RecordBookColumn = exports.AuditLog = exports.ReportTemplate = exports.StudentEnrollment = exports.BulkMessageRecipient = exports.BulkMessage = exports.ApplicationDocument = exports.Application = exports.GeneralLedgerEntry = exports.ChartOfAccount = void 0;
const User_1 = require("./User");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return User_1.User; } });
const SchoolRole_1 = require("./SchoolRole");
Object.defineProperty(exports, "SchoolRole", { enumerable: true, get: function () { return SchoolRole_1.SchoolRole; } });
const SchoolYear_1 = require("./SchoolYear");
Object.defineProperty(exports, "SchoolYear", { enumerable: true, get: function () { return SchoolYear_1.SchoolYear; } });
const Term_1 = require("./Term");
Object.defineProperty(exports, "Term", { enumerable: true, get: function () { return Term_1.Term; } });
const Form_1 = require("./Form");
Object.defineProperty(exports, "Form", { enumerable: true, get: function () { return Form_1.Form; } });
const SchoolClass_1 = require("./SchoolClass");
Object.defineProperty(exports, "SchoolClass", { enumerable: true, get: function () { return SchoolClass_1.SchoolClass; } });
const Subject_1 = require("./Subject");
Object.defineProperty(exports, "Subject", { enumerable: true, get: function () { return Subject_1.Subject; } });
const Department_1 = require("./Department");
Object.defineProperty(exports, "Department", { enumerable: true, get: function () { return Department_1.Department; } });
const ClassSubject_1 = require("./ClassSubject");
Object.defineProperty(exports, "ClassSubject", { enumerable: true, get: function () { return ClassSubject_1.ClassSubject; } });
const Section_1 = require("./Section");
Object.defineProperty(exports, "Section", { enumerable: true, get: function () { return Section_1.Section; } });
const TeacherAssignment_1 = require("./TeacherAssignment");
Object.defineProperty(exports, "TeacherAssignment", { enumerable: true, get: function () { return TeacherAssignment_1.TeacherAssignment; } });
const TimetableSlot_1 = require("./TimetableSlot");
Object.defineProperty(exports, "TimetableSlot", { enumerable: true, get: function () { return TimetableSlot_1.TimetableSlot; } });
const Parent_1 = require("./Parent");
Object.defineProperty(exports, "Parent", { enumerable: true, get: function () { return Parent_1.Parent; } });
const Student_1 = require("./Student");
Object.defineProperty(exports, "Student", { enumerable: true, get: function () { return Student_1.Student; } });
const Guardian_1 = require("./Guardian");
Object.defineProperty(exports, "Guardian", { enumerable: true, get: function () { return Guardian_1.Guardian; } });
const Staff_1 = require("./Staff");
Object.defineProperty(exports, "Staff", { enumerable: true, get: function () { return Staff_1.Staff; } });
const StaffAttendance_1 = require("./StaffAttendance");
Object.defineProperty(exports, "StaffAttendance", { enumerable: true, get: function () { return StaffAttendance_1.StaffAttendance; } });
const StudentAttendance_1 = require("./StudentAttendance");
Object.defineProperty(exports, "StudentAttendance", { enumerable: true, get: function () { return StudentAttendance_1.StudentAttendance; } });
const ExamType_1 = require("./ExamType");
Object.defineProperty(exports, "ExamType", { enumerable: true, get: function () { return ExamType_1.ExamType; } });
const ExamMark_1 = require("./ExamMark");
Object.defineProperty(exports, "ExamMark", { enumerable: true, get: function () { return ExamMark_1.ExamMark; } });
const ReportCard_1 = require("./ReportCard");
Object.defineProperty(exports, "ReportCard", { enumerable: true, get: function () { return ReportCard_1.ReportCard; } });
const HonourRoll_1 = require("./HonourRoll");
Object.defineProperty(exports, "HonourRoll", { enumerable: true, get: function () { return HonourRoll_1.HonourRoll; } });
const Invoice_1 = require("./Invoice");
Object.defineProperty(exports, "Invoice", { enumerable: true, get: function () { return Invoice_1.Invoice; } });
const InvoiceLine_1 = require("./InvoiceLine");
Object.defineProperty(exports, "InvoiceLine", { enumerable: true, get: function () { return InvoiceLine_1.InvoiceLine; } });
const Payment_1 = require("./Payment");
Object.defineProperty(exports, "Payment", { enumerable: true, get: function () { return Payment_1.Payment; } });
const Receipt_1 = require("./Receipt");
Object.defineProperty(exports, "Receipt", { enumerable: true, get: function () { return Receipt_1.Receipt; } });
const LedgerEntry_1 = require("./LedgerEntry");
Object.defineProperty(exports, "LedgerEntry", { enumerable: true, get: function () { return LedgerEntry_1.LedgerEntry; } });
const CashbookEntry_1 = require("./CashbookEntry");
Object.defineProperty(exports, "CashbookEntry", { enumerable: true, get: function () { return CashbookEntry_1.CashbookEntry; } });
const Timetable_1 = require("./Timetable");
Object.defineProperty(exports, "Timetable", { enumerable: true, get: function () { return Timetable_1.Timetable; } });
const TeacherAllocation_1 = require("./TeacherAllocation");
Object.defineProperty(exports, "TeacherAllocation", { enumerable: true, get: function () { return TeacherAllocation_1.TeacherAllocation; } });
const LearningSchedule_1 = require("./LearningSchedule");
Object.defineProperty(exports, "LearningSchedule", { enumerable: true, get: function () { return LearningSchedule_1.LearningSchedule; } });
const WeeklyAssessment_1 = require("./WeeklyAssessment");
Object.defineProperty(exports, "WeeklyAssessment", { enumerable: true, get: function () { return WeeklyAssessment_1.WeeklyAssessment; } });
const Message_1 = require("./Message");
Object.defineProperty(exports, "Message", { enumerable: true, get: function () { return Message_1.Message; } });
const MessageAttachment_1 = require("./MessageAttachment");
Object.defineProperty(exports, "MessageAttachment", { enumerable: true, get: function () { return MessageAttachment_1.MessageAttachment; } });
const Notification_1 = require("./Notification");
Object.defineProperty(exports, "Notification", { enumerable: true, get: function () { return Notification_1.Notification; } });
const TuckshopItem_1 = require("./TuckshopItem");
Object.defineProperty(exports, "TuckshopItem", { enumerable: true, get: function () { return TuckshopItem_1.TuckshopItem; } });
const TuckshopSale_1 = require("./TuckshopSale");
Object.defineProperty(exports, "TuckshopSale", { enumerable: true, get: function () { return TuckshopSale_1.TuckshopSale; } });
const UniformSale_1 = require("./UniformSale");
Object.defineProperty(exports, "UniformSale", { enumerable: true, get: function () { return UniformSale_1.UniformSale; } });
const SchoolSettings_1 = require("./SchoolSettings");
Object.defineProperty(exports, "SchoolSettings", { enumerable: true, get: function () { return SchoolSettings_1.SchoolSettings; } });
const SchoolFee_1 = require("./SchoolFee");
Object.defineProperty(exports, "SchoolFee", { enumerable: true, get: function () { return SchoolFee_1.SchoolFee; } });
const ClassPromotionRule_1 = require("./ClassPromotionRule");
Object.defineProperty(exports, "ClassPromotionRule", { enumerable: true, get: function () { return ClassPromotionRule_1.ClassPromotionRule; } });
const ResultsPublication_1 = require("./ResultsPublication");
Object.defineProperty(exports, "ResultsPublication", { enumerable: true, get: function () { return ResultsPublication_1.ResultsPublication; } });
const StudentTermBalance_1 = require("./StudentTermBalance");
Object.defineProperty(exports, "StudentTermBalance", { enumerable: true, get: function () { return StudentTermBalance_1.StudentTermBalance; } });
const StaffPayrollProfile_1 = require("./StaffPayrollProfile");
Object.defineProperty(exports, "StaffPayrollProfile", { enumerable: true, get: function () { return StaffPayrollProfile_1.StaffPayrollProfile; } });
const PayrollRun_1 = require("./PayrollRun");
Object.defineProperty(exports, "PayrollRun", { enumerable: true, get: function () { return PayrollRun_1.PayrollRun; } });
const Payslip_1 = require("./Payslip");
Object.defineProperty(exports, "Payslip", { enumerable: true, get: function () { return Payslip_1.Payslip; } });
const StaffLeaveBalance_1 = require("./StaffLeaveBalance");
Object.defineProperty(exports, "StaffLeaveBalance", { enumerable: true, get: function () { return StaffLeaveBalance_1.StaffLeaveBalance; } });
const TuitionExemption_1 = require("./TuitionExemption");
Object.defineProperty(exports, "TuitionExemption", { enumerable: true, get: function () { return TuitionExemption_1.TuitionExemption; } });
const InvoiceAdjustment_1 = require("./InvoiceAdjustment");
Object.defineProperty(exports, "InvoiceAdjustment", { enumerable: true, get: function () { return InvoiceAdjustment_1.InvoiceAdjustment; } });
const ChartOfAccount_1 = require("./ChartOfAccount");
Object.defineProperty(exports, "ChartOfAccount", { enumerable: true, get: function () { return ChartOfAccount_1.ChartOfAccount; } });
const GeneralLedgerEntry_1 = require("./GeneralLedgerEntry");
Object.defineProperty(exports, "GeneralLedgerEntry", { enumerable: true, get: function () { return GeneralLedgerEntry_1.GeneralLedgerEntry; } });
const Application_1 = require("./Application");
Object.defineProperty(exports, "Application", { enumerable: true, get: function () { return Application_1.Application; } });
const ApplicationDocument_1 = require("./ApplicationDocument");
Object.defineProperty(exports, "ApplicationDocument", { enumerable: true, get: function () { return ApplicationDocument_1.ApplicationDocument; } });
const BulkMessage_1 = require("./BulkMessage");
Object.defineProperty(exports, "BulkMessage", { enumerable: true, get: function () { return BulkMessage_1.BulkMessage; } });
const BulkMessageRecipient_1 = require("./BulkMessageRecipient");
Object.defineProperty(exports, "BulkMessageRecipient", { enumerable: true, get: function () { return BulkMessageRecipient_1.BulkMessageRecipient; } });
const StudentEnrollment_1 = require("./StudentEnrollment");
Object.defineProperty(exports, "StudentEnrollment", { enumerable: true, get: function () { return StudentEnrollment_1.StudentEnrollment; } });
const ReportTemplate_1 = require("./ReportTemplate");
Object.defineProperty(exports, "ReportTemplate", { enumerable: true, get: function () { return ReportTemplate_1.ReportTemplate; } });
const AuditLog_1 = require("./AuditLog");
Object.defineProperty(exports, "AuditLog", { enumerable: true, get: function () { return AuditLog_1.AuditLog; } });
const RecordBookColumn_1 = require("./RecordBookColumn");
Object.defineProperty(exports, "RecordBookColumn", { enumerable: true, get: function () { return RecordBookColumn_1.RecordBookColumn; } });
const RecordBookMark_1 = require("./RecordBookMark");
Object.defineProperty(exports, "RecordBookMark", { enumerable: true, get: function () { return RecordBookMark_1.RecordBookMark; } });
const HomeworkAssignment_1 = require("./HomeworkAssignment");
Object.defineProperty(exports, "HomeworkAssignment", { enumerable: true, get: function () { return HomeworkAssignment_1.HomeworkAssignment; } });
const NotificationLog_1 = require("./NotificationLog");
Object.defineProperty(exports, "NotificationLog", { enumerable: true, get: function () { return NotificationLog_1.NotificationLog; } });
exports.entities = [
    User_1.User,
    SchoolRole_1.SchoolRole,
    SchoolSettings_1.SchoolSettings,
    SchoolFee_1.SchoolFee,
    ClassPromotionRule_1.ClassPromotionRule,
    ResultsPublication_1.ResultsPublication,
    StudentTermBalance_1.StudentTermBalance,
    SchoolYear_1.SchoolYear,
    Term_1.Term,
    Form_1.Form,
    SchoolClass_1.SchoolClass,
    Subject_1.Subject,
    Department_1.Department,
    ClassSubject_1.ClassSubject,
    Section_1.Section,
    TeacherAssignment_1.TeacherAssignment,
    TimetableSlot_1.TimetableSlot,
    Parent_1.Parent,
    Student_1.Student,
    Guardian_1.Guardian,
    Staff_1.Staff,
    StaffAttendance_1.StaffAttendance,
    StudentAttendance_1.StudentAttendance,
    ExamType_1.ExamType,
    ExamMark_1.ExamMark,
    ReportCard_1.ReportCard,
    HonourRoll_1.HonourRoll,
    Invoice_1.Invoice,
    InvoiceLine_1.InvoiceLine,
    Payment_1.Payment,
    Receipt_1.Receipt,
    LedgerEntry_1.LedgerEntry,
    CashbookEntry_1.CashbookEntry,
    Timetable_1.Timetable,
    TeacherAllocation_1.TeacherAllocation,
    LearningSchedule_1.LearningSchedule,
    WeeklyAssessment_1.WeeklyAssessment,
    Message_1.Message,
    MessageAttachment_1.MessageAttachment,
    Notification_1.Notification,
    TuckshopItem_1.TuckshopItem,
    TuckshopSale_1.TuckshopSale,
    UniformSale_1.UniformSale,
    StaffPayrollProfile_1.StaffPayrollProfile,
    PayrollRun_1.PayrollRun,
    Payslip_1.Payslip,
    StaffLeaveBalance_1.StaffLeaveBalance,
    TuitionExemption_1.TuitionExemption,
    InvoiceAdjustment_1.InvoiceAdjustment,
    ChartOfAccount_1.ChartOfAccount,
    GeneralLedgerEntry_1.GeneralLedgerEntry,
    Application_1.Application,
    ApplicationDocument_1.ApplicationDocument,
    BulkMessage_1.BulkMessage,
    BulkMessageRecipient_1.BulkMessageRecipient,
    StudentEnrollment_1.StudentEnrollment,
    ReportTemplate_1.ReportTemplate,
    AuditLog_1.AuditLog,
    RecordBookColumn_1.RecordBookColumn,
    RecordBookMark_1.RecordBookMark,
    HomeworkAssignment_1.HomeworkAssignment,
    NotificationLog_1.NotificationLog,
];
__exportStar(require("./enums"), exports);
