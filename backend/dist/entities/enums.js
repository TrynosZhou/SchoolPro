"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashbookEntryType = exports.ExamTypeName = exports.FeeType = exports.InvoiceStatus = exports.PaymentMethod = exports.AttendanceStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["DIRECTOR"] = "director";
    UserRole["PRINCIPAL"] = "principal";
    UserRole["ADMIN"] = "admin";
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
