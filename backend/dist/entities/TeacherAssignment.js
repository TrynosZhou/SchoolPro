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
exports.TeacherAssignment = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const Staff_1 = require("./Staff");
const SchoolClass_1 = require("./SchoolClass");
const Section_1 = require("./Section");
const Subject_1 = require("./Subject");
const TimetableSlot_1 = require("./TimetableSlot");
let TeacherAssignment = class TeacherAssignment {
};
exports.TeacherAssignment = TeacherAssignment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], TeacherAssignment.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], TeacherAssignment.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Section_1.Section, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'sectionId' }),
    __metadata("design:type", Section_1.Section)
], TeacherAssignment.prototype, "section", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "sectionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], TeacherAssignment.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32 }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], TeacherAssignment.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], TeacherAssignment.prototype, "weeklyPeriods", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16, default: enums_1.LessonLength.SINGLE }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "lessonLength", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], TeacherAssignment.prototype, "isSharedSplit", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], TeacherAssignment.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TeacherAssignment.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], TeacherAssignment.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => TimetableSlot_1.TimetableSlot, (slot) => slot.assignment),
    __metadata("design:type", Array)
], TeacherAssignment.prototype, "timetableSlots", void 0);
exports.TeacherAssignment = TeacherAssignment = __decorate([
    (0, typeorm_1.Entity)('teacher_assignments')
], TeacherAssignment);
