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
exports.StudentTermBalance = void 0;
const typeorm_1 = require("typeorm");
const Student_1 = require("./Student");
const Term_1 = require("./Term");
const Invoice_1 = require("./Invoice");
/** Per-student, per-term opening/closing invoice balance including carry-forward and prepaid credit. */
let StudentTermBalance = class StudentTermBalance {
};
exports.StudentTermBalance = StudentTermBalance;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StudentTermBalance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], StudentTermBalance.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StudentTermBalance.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], StudentTermBalance.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StudentTermBalance.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StudentTermBalance.prototype, "openingBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StudentTermBalance.prototype, "prepaidApplied", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StudentTermBalance.prototype, "overpaymentPrepaid", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StudentTermBalance.prototype, "overpaymentPrepaidApplied", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Invoice_1.Invoice, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'carryForwardInvoiceId' }),
    __metadata("design:type", Invoice_1.Invoice)
], StudentTermBalance.prototype, "carryForwardInvoice", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StudentTermBalance.prototype, "carryForwardInvoiceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 12, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], StudentTermBalance.prototype, "closingBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], StudentTermBalance.prototype, "initialized", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StudentTermBalance.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], StudentTermBalance.prototype, "updatedAt", void 0);
exports.StudentTermBalance = StudentTermBalance = __decorate([
    (0, typeorm_1.Entity)('student_term_balances'),
    (0, typeorm_1.Unique)(['studentId', 'termId'])
], StudentTermBalance);
