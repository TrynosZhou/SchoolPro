"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Payslip = void 0;
const typeorm_1 = require("typeorm");
const PayrollRun_1 = require("./PayrollRun");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
let Payslip = class Payslip {
};
exports.Payslip = Payslip;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Payslip.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => PayrollRun_1.PayrollRun, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'payrollRunId' }),
    __metadata("design:type", PayrollRun_1.PayrollRun)
], Payslip.prototype, "payrollRun", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Payslip.prototype, "payrollRunId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'staffId' }),
    __metadata("design:type", Staff_1.Staff)
], Payslip.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Payslip.prototype, "staffId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Payslip.prototype, "employeeNumber", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Payslip.prototype, "staffName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Payslip.prototype, "department", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Payslip.prototype, "jobTitle", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "baseSalary", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "housingAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "transportAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "medicalAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "otherAllowances", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "grossPay", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "payeAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "nssaAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "pensionAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "loanDeduction", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "otherDeductions", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "totalDeductions", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "netPay", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.PayrollPaymentMethod, default: enums_1.PayrollPaymentMethod.BANK_TRANSFER }),
    __metadata("design:type", String)
], Payslip.prototype, "paymentMethod", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Payslip.prototype, "bankName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Payslip.prototype, "bankAccount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.PayslipStatus, default: enums_1.PayslipStatus.PENDING }),
    __metadata("design:type", String)
], Payslip.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Payslip.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2, default: 12 }),
    __metadata("design:type", Number)
], Payslip.prototype, "annualLeaveEntitlement", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2, default: 1 }),
    __metadata("design:type", Number)
], Payslip.prototype, "monthlyLeaveAccrual", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 8, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "leaveOpeningBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "leaveTakenDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 8, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Payslip.prototype, "leaveClosingBalance", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Payslip.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Payslip.prototype, "updatedAt", void 0);
exports.Payslip = Payslip = __decorate([
    (0, typeorm_1.Entity)('payslips'),
    (0, typeorm_1.Unique)(['payrollRunId', 'staffId'])
], Payslip);
