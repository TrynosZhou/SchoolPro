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
exports.RecordBookMark = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Term_1 = require("./Term");
const SchoolClass_1 = require("./SchoolClass");
const Student_1 = require("./Student");
const Staff_1 = require("./Staff");
const Subject_1 = require("./Subject");
let RecordBookMark = class RecordBookMark {
};
exports.RecordBookMark = RecordBookMark;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RecordBookMark.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], RecordBookMark.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], RecordBookMark.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], RecordBookMark.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "ownerKey", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], RecordBookMark.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookMark.prototype, "columnKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2 }),
    __metadata("design:type", Number)
], RecordBookMark.prototype, "marks", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'enteredById' }),
    __metadata("design:type", Staff_1.Staff)
], RecordBookMark.prototype, "enteredBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], RecordBookMark.prototype, "enteredById", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], RecordBookMark.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], RecordBookMark.prototype, "updatedAt", void 0);
exports.RecordBookMark = RecordBookMark = __decorate([
    (0, typeorm_1.Entity)('record_book_marks'),
    (0, typeorm_1.Unique)(['termId', 'classId', 'ownerKey', 'subjectId', 'studentId', 'columnKey'])
], RecordBookMark);
