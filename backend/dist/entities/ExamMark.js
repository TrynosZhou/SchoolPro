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
exports.ExamMark = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Student_1 = require("./Student");
const Subject_1 = require("./Subject");
const ExamType_1 = require("./ExamType");
const Term_1 = require("./Term");
const SchoolClass_1 = require("./SchoolClass");
const Staff_1 = require("./Staff");
let ExamMark = class ExamMark {
};
exports.ExamMark = ExamMark;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ExamMark.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, (s) => s.examMarks, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], ExamMark.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ExamMark.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, (s) => s.examMarks, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], ExamMark.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ExamMark.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ExamType_1.ExamType, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'examTypeId' }),
    __metadata("design:type", ExamType_1.ExamType)
], ExamMark.prototype, "examType", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ExamMark.prototype, "examTypeId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], ExamMark.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ExamMark.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], ExamMark.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ExamMark.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2 }),
    __metadata("design:type", Number)
], ExamMark.prototype, "marks", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ExamMark.prototype, "grade", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ExamMark.prototype, "remarks", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'enteredById' }),
    __metadata("design:type", Staff_1.Staff)
], ExamMark.prototype, "enteredBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ExamMark.prototype, "enteredById", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ExamMark.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ExamMark.prototype, "updatedAt", void 0);
exports.ExamMark = ExamMark = __decorate([
    (0, typeorm_1.Entity)('exam_marks'),
    (0, typeorm_1.Unique)(['studentId', 'subjectId', 'examTypeId', 'termId'])
], ExamMark);
