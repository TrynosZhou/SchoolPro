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
exports.StaffPayrollProfile = void 0;
const typeorm_1 = require("typeorm");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
let StaffPayrollProfile = class StaffPayrollProfile {
};
exports.StaffPayrollProfile = StaffPayrollProfile;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => Staff_1.Staff, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'staffId' }),
    __metadata("design:type", Staff_1.Staff)
], StaffPayrollProfile.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "staffId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "jobTitle", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.PayFrequency, default: enums_1.PayFrequency.MONTHLY }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "payFrequency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "baseSalary", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "housingAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "transportAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "medicalAllowance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "otherAllowances", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "payeAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "nssaAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "pensionAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "loanDeduction", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "otherDeductions", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "bankName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "bankAccount", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "bankBranch", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "taxReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "nssaNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.PayrollPaymentMethod, default: enums_1.PayrollPaymentMethod.BANK_TRANSFER }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "paymentMethod", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], StaffPayrollProfile.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2, default: 12 }),
    __metadata("design:type", Number)
], StaffPayrollProfile.prototype, "annualLeaveDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], StaffPayrollProfile.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StaffPayrollProfile.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], StaffPayrollProfile.prototype, "updatedAt", void 0);
exports.StaffPayrollProfile = StaffPayrollProfile = __decorate([
    (0, typeorm_1.Entity)('staff_payroll_profiles')
], StaffPayrollProfile);
