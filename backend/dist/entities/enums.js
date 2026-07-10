"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationDocumentType = exports.ApplicationStatus = exports.TeacherAssignmentRole = exports.DayOfWeek = exports.LessonLength = exports.GlReferenceType = exports.GlAccountType = exports.PayslipStatus = exports.PayrollRunStatus = exports.PayrollPaymentMethod = exports.PayFrequency = exports.CashbookEntryType = exports.ExamTypeName = exports.InvoiceAdjustmentType = exports.TuitionExemptionType = exports.FeeType = exports.EnrollmentStatus = exports.StudentStatus = exports.StudentType = exports.InvoiceStatus = exports.PaymentMethod = exports.AttendanceStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["DIRECTOR"] = "director";
    UserRole["PRINCIPAL"] = "principal";
    UserRole["ADMIN"] = "admin";
    UserRole["ACCOUNTANT"] = "accountant";
    UserRole["TEACHER"] = "teacher";
    UserRole["PARENT"] = "parent";
    UserRole["STUDENT"] = "student";
})(UserRole || (exports.UserRole = UserRole = {}));
var AttendanceStatus;
(function (AttendanceStatus) {
    AttendanceStatus["PRESENT"] = "present";
    AttendanceStatus["ABSENT"] = "absent";
    AttendanceStatus["LATE"] = "late";
    AttendanceStatus["EXCUSED"] = "excused";
})(AttendanceStatus || (exports.AttendanceStatus = AttendanceStatus = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["CASH"] = "cash";
    PaymentMethod["BANK"] = "bank";
    PaymentMethod["ECOCASH"] = "ecocash";
    PaymentMethod["ONEMONEY"] = "onemoney";
    PaymentMethod["INNBUCKS"] = "innbucks";
    PaymentMethod["OTHER"] = "other";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["DRAFT"] = "draft";
    InvoiceStatus["SENT"] = "sent";
    InvoiceStatus["PARTIAL"] = "partial";
    InvoiceStatus["PAID"] = "paid";
    InvoiceStatus["OVERDUE"] = "overdue";
    InvoiceStatus["CANCELLED"] = "cancelled";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
var StudentType;
(function (StudentType) {
    StudentType["DAY_SCHOLAR"] = "day_scholar";
    StudentType["BOARDER"] = "boarder";
})(StudentType || (exports.StudentType = StudentType = {}));
/** Lifecycle status of a student on the roll (for retention / dropout analytics). */
var StudentStatus;
(function (StudentStatus) {
    StudentStatus["ACTIVE"] = "active";
    StudentStatus["GRADUATED"] = "graduated";
    StudentStatus["TRANSFERRED"] = "transferred";
    StudentStatus["WITHDRAWN"] = "withdrawn";
    StudentStatus["SUSPENDED"] = "suspended";
})(StudentStatus || (exports.StudentStatus = StudentStatus = {}));
/** Status of a per-academic-year enrollment snapshot. */
var EnrollmentStatus;
(function (EnrollmentStatus) {
    /** Currently enrolled / on the roll for that academic year. */
    EnrollmentStatus["ENROLLED"] = "enrolled";
    /** Completed the year and expected to continue (promoted). */
    EnrollmentStatus["COMPLETED"] = "completed";
    /** Left during or at the end of the year and did not continue. */
    EnrollmentStatus["LEFT"] = "left";
})(EnrollmentStatus || (exports.EnrollmentStatus = EnrollmentStatus = {}));
var FeeType;
(function (FeeType) {
    FeeType["TUITION"] = "tuition";
    FeeType["BUS_LEVY"] = "bus_levy";
    FeeType["UNIFORM"] = "uniform";
    FeeType["TUCKSHOP"] = "tuckshop";
    FeeType["EXAM"] = "exam";
    FeeType["SPORTS"] = "sports";
    FeeType["OTHER"] = "other";
})(FeeType || (exports.FeeType = FeeType = {}));
var TuitionExemptionType;
(function (TuitionExemptionType) {
    TuitionExemptionType["PERCENTAGE"] = "percentage";
    TuitionExemptionType["AMOUNT"] = "amount";
    TuitionExemptionType["STAFF_CHILD"] = "staff_child";
})(TuitionExemptionType || (exports.TuitionExemptionType = TuitionExemptionType = {}));
var InvoiceAdjustmentType;
(function (InvoiceAdjustmentType) {
    InvoiceAdjustmentType["CREDIT_NOTE"] = "credit_note";
    InvoiceAdjustmentType["DEBIT_NOTE"] = "debit_note";
})(InvoiceAdjustmentType || (exports.InvoiceAdjustmentType = InvoiceAdjustmentType = {}));
var ExamTypeName;
(function (ExamTypeName) {
    ExamTypeName["CONTINUOUS"] = "continuous";
    ExamTypeName["MID_TERM"] = "mid_term";
    ExamTypeName["END_OF_TERM"] = "end_of_term";
    ExamTypeName["FINAL"] = "final";
})(ExamTypeName || (exports.ExamTypeName = ExamTypeName = {}));
var CashbookEntryType;
(function (CashbookEntryType) {
    CashbookEntryType["RECEIPT"] = "receipt";
    CashbookEntryType["PAYMENT"] = "payment";
    CashbookEntryType["TRANSFER"] = "transfer";
})(CashbookEntryType || (exports.CashbookEntryType = CashbookEntryType = {}));
var PayFrequency;
(function (PayFrequency) {
    PayFrequency["MONTHLY"] = "monthly";
    PayFrequency["BIWEEKLY"] = "biweekly";
})(PayFrequency || (exports.PayFrequency = PayFrequency = {}));
var PayrollPaymentMethod;
(function (PayrollPaymentMethod) {
    PayrollPaymentMethod["BANK_TRANSFER"] = "bank_transfer";
    PayrollPaymentMethod["CASH"] = "cash";
    PayrollPaymentMethod["ECOCASH"] = "ecocash";
})(PayrollPaymentMethod || (exports.PayrollPaymentMethod = PayrollPaymentMethod = {}));
var PayrollRunStatus;
(function (PayrollRunStatus) {
    PayrollRunStatus["DRAFT"] = "draft";
    PayrollRunStatus["PROCESSED"] = "processed";
    PayrollRunStatus["PAID"] = "paid";
    PayrollRunStatus["CANCELLED"] = "cancelled";
})(PayrollRunStatus || (exports.PayrollRunStatus = PayrollRunStatus = {}));
var PayslipStatus;
(function (PayslipStatus) {
    PayslipStatus["PENDING"] = "pending";
    PayslipStatus["PAID"] = "paid";
    PayslipStatus["EXCLUDED"] = "excluded";
})(PayslipStatus || (exports.PayslipStatus = PayslipStatus = {}));
var GlAccountType;
(function (GlAccountType) {
    GlAccountType["REVENUE"] = "REVENUE";
    GlAccountType["EXPENSE"] = "EXPENSE";
    GlAccountType["ASSET"] = "ASSET";
    GlAccountType["LIABILITY"] = "LIABILITY";
    GlAccountType["EQUITY"] = "EQUITY";
})(GlAccountType || (exports.GlAccountType = GlAccountType = {}));
var GlReferenceType;
(function (GlReferenceType) {
    GlReferenceType["FEE_PAYMENT"] = "FEE_PAYMENT";
    GlReferenceType["SALARY"] = "SALARY";
    GlReferenceType["EXPENSE"] = "EXPENSE";
    GlReferenceType["REFUND"] = "REFUND";
    GlReferenceType["MANUAL_ADJUSTMENT"] = "MANUAL_ADJUSTMENT";
    GlReferenceType["OTHER"] = "OTHER";
})(GlReferenceType || (exports.GlReferenceType = GlReferenceType = {}));
/** Timetable slot length for a weekly lesson assignment (Teacher Load). */
var LessonLength;
(function (LessonLength) {
    LessonLength["SINGLE"] = "single";
    LessonLength["DOUBLE"] = "double";
    LessonLength["TRIPLE"] = "triple";
})(LessonLength || (exports.LessonLength = LessonLength = {}));
/** Weekday labels stored on teacher allocations (maps to timetable dayOfWeek 1=Mon … 7=Sun). */
var DayOfWeek;
(function (DayOfWeek) {
    DayOfWeek["MONDAY"] = "MONDAY";
    DayOfWeek["TUESDAY"] = "TUESDAY";
    DayOfWeek["WEDNESDAY"] = "WEDNESDAY";
    DayOfWeek["THURSDAY"] = "THURSDAY";
    DayOfWeek["FRIDAY"] = "FRIDAY";
    DayOfWeek["SATURDAY"] = "SATURDAY";
    DayOfWeek["SUNDAY"] = "SUNDAY";
})(DayOfWeek || (exports.DayOfWeek = DayOfWeek = {}));
/** Role for teacher-to-class assignments (homeroom vs subject teaching). */
var TeacherAssignmentRole;
(function (TeacherAssignmentRole) {
    TeacherAssignmentRole["CLASS_TEACHER"] = "class_teacher";
    TeacherAssignmentRole["SUBJECT_TEACHER"] = "subject_teacher";
})(TeacherAssignmentRole || (exports.TeacherAssignmentRole = TeacherAssignmentRole = {}));
/** Admission application pipeline stages. */
var ApplicationStatus;
(function (ApplicationStatus) {
    ApplicationStatus["APPLIED"] = "applied";
    ApplicationStatus["SHORTLISTED"] = "shortlisted";
    ApplicationStatus["ADMITTED"] = "admitted";
    ApplicationStatus["REJECTED"] = "rejected";
})(ApplicationStatus || (exports.ApplicationStatus = ApplicationStatus = {}));
/** Supporting document categories for an admission application. */
var ApplicationDocumentType;
(function (ApplicationDocumentType) {
    ApplicationDocumentType["BIRTH_CERTIFICATE"] = "birth_certificate";
    ApplicationDocumentType["REPORT_CARD"] = "report_card";
    ApplicationDocumentType["PASSPORT_PHOTO"] = "passport_photo";
    ApplicationDocumentType["ID_COPY"] = "id_copy";
    ApplicationDocumentType["OTHER"] = "other";
})(ApplicationDocumentType || (exports.ApplicationDocumentType = ApplicationDocumentType = {}));
