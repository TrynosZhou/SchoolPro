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
exports.StudentEnrollment = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const Student_1 = require("./Student");
const SchoolYear_1 = require("./SchoolYear");
/**
 * Per-academic-year snapshot of a student's enrollment. One row per (student, school year).
 * This is the historical backbone for year-over-year retention & dropout analytics — the
 * live `Student` record only holds the current state, so without these snapshots we cannot
 * tell whether a student who was on the roll last year re-enrolled this year.
 *
 * `formName` / `className` are denormalised labels so historical reports remain meaningful
 * even if the class/form is later renamed or deleted.
 */
let StudentEnrollment = class StudentEnrollment {
};
exports.StudentEnrollment = StudentEnrollment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, { ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], StudentEnrollment.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolYear_1.SchoolYear, { ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'schoolYearId' }),
    __metadata("design:type", SchoolYear_1.SchoolYear)
], StudentEnrollment.prototype, "schoolYear", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "schoolYearId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "formId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, length: 120 }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "formName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, length: 120 }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "className", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 24, default: enums_1.EnrollmentStatus.ENROLLED }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], StudentEnrollment.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StudentEnrollment.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], StudentEnrollment.prototype, "updatedAt", void 0);
exports.StudentEnrollment = StudentEnrollment = __decorate([
    (0, typeorm_1.Entity)('student_enrollments'),
    (0, typeorm_1.Unique)('UQ_enrollment_student_year', ['studentId', 'schoolYearId'])
], StudentEnrollment);
