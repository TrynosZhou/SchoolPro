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
exports.StaffLeaveBalance = exports.Payslip = exports.PayrollRun = exports.StaffPayrollProfile = exports.StudentTermBalance = exports.ResultsPublication = exports.ClassPromotionRule = exports.SchoolFee = exports.SchoolSettings = exports.UniformSale = exports.TuckshopSale = exports.TuckshopItem = exports.Notification = exports.Message = exports.WeeklyAssessment = exports.LearningSchedule = exports.Timetable = exports.CashbookEntry = exports.LedgerEntry = exports.Receipt = exports.Payment = exports.InvoiceLine = exports.Invoice = exports.HonourRoll = exports.ReportCard = exports.ExamMark = exports.ExamType = exports.StudentAttendance = exports.StaffAttendance = exports.Staff = exports.Guardian = exports.Student = exports.Parent = exports.ClassSubject = exports.Department = exports.Subject = exports.SchoolClass = exports.Form = exports.Term = exports.SchoolYear = exports.SchoolRole = exports.User = exports.entities = void 0;
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
const LearningSchedule_1 = require("./LearningSchedule");
Object.defineProperty(exports, "LearningSchedule", { enumerable: true, get: function () { return LearningSchedule_1.LearningSchedule; } });
const WeeklyAssessment_1 = require("./WeeklyAssessment");
Object.defineProperty(exports, "WeeklyAssessment", { enumerable: true, get: function () { return WeeklyAssessment_1.WeeklyAssessment; } });
const Message_1 = require("./Message");
Object.defineProperty(exports, "Message", { enumerable: true, get: function () { return Message_1.Message; } });
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
    LearningSchedule_1.LearningSchedule,
    WeeklyAssessment_1.WeeklyAssessment,
    Message_1.Message,
    Notification_1.Notification,
    TuckshopItem_1.TuckshopItem,
    TuckshopSale_1.TuckshopSale,
    UniformSale_1.UniformSale,
    StaffPayrollProfile_1.StaffPayrollProfile,
    PayrollRun_1.PayrollRun,
    Payslip_1.Payslip,
    StaffLeaveBalance_1.StaffLeaveBalance,
];
__exportStar(require("./enums"), exports);
