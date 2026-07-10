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
exports.TeacherAllocation = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("./enums");
const Timetable_1 = require("./Timetable");
const Staff_1 = require("./Staff");
const Subject_1 = require("./Subject");
const SchoolClass_1 = require("./SchoolClass");
let TeacherAllocation = class TeacherAllocation {
};
exports.TeacherAllocation = TeacherAllocation;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Timetable_1.Timetable, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'timetableEntryId' }),
    __metadata("design:type", Timetable_1.Timetable)
], TeacherAllocation.prototype, "timetableEntry", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "timetableEntryId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], TeacherAllocation.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], TeacherAllocation.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], TeacherAllocation.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.DayOfWeek }),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "dayOfWeek", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 8 }),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 8 }),
    __metadata("design:type", String)
], TeacherAllocation.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TeacherAllocation.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], TeacherAllocation.prototype, "updatedAt", void 0);
exports.TeacherAllocation = TeacherAllocation = __decorate([
    (0, typeorm_1.Entity)('teacher_allocations'),
    (0, typeorm_1.Unique)('UQ_teacher_allocations_timetable_entry', ['timetableEntryId'])
    // NOTE: a teacher may be allocated to 2+ classes in the same slot (double-booking is
    // allowed via the timetable "Ignore conflicts" flow), so there is intentionally no
    // unique constraint on (teacherId, dayOfWeek, startTime, endTime).
], TeacherAllocation);
