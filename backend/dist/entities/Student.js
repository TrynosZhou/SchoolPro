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
exports.Student = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const User_1 = require("./User");
const SchoolClass_1 = require("./SchoolClass");
const Form_1 = require("./Form");
const Guardian_1 = require("./Guardian");
const StudentAttendance_1 = require("./StudentAttendance");
const ExamMark_1 = require("./ExamMark");
const Invoice_1 = require("./Invoice");
const LedgerEntry_1 = require("./LedgerEntry");
let Student = class Student {
};
exports.Student = Student;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Student.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], Student.prototype, "admissionNumber", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => User_1.User, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", User_1.User)
], Student.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Student.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Student.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "dateOfBirth", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "gender", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, default: enums_1.StudentType.DAY_SCHOLAR }),
    __metadata("design:type", String)
], Student.prototype, "studentType", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "previousSchool", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "photoUrl", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, (c) => c.students, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], Student.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Form_1.Form, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'formId' }),
    __metadata("design:type", Form_1.Form)
], Student.prototype, "form", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "formId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Student.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], Student.prototype, "enrollmentDate", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Guardian_1.Guardian, (g) => g.student),
    __metadata("design:type", Array)
], Student.prototype, "guardians", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => StudentAttendance_1.StudentAttendance, (a) => a.student),
    __metadata("design:type", Array)
], Student.prototype, "attendanceRecords", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ExamMark_1.ExamMark, (m) => m.student),
    __metadata("design:type", Array)
], Student.prototype, "examMarks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Invoice_1.Invoice, (i) => i.student),
    __metadata("design:type", Array)
], Student.prototype, "invoices", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => LedgerEntry_1.LedgerEntry, (l) => l.student),
    __metadata("design:type", Array)
], Student.prototype, "ledgerEntries", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Student.prototype, "createdAt", void 0);
exports.Student = Student = __decorate([
    (0, typeorm_1.Entity)('students')
], Student);
