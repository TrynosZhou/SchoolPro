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
exports.LmsSubmission = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const LmsAssignment_1 = require("./LmsAssignment");
const Student_1 = require("./Student");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
let LmsSubmission = class LmsSubmission {
};
exports.LmsSubmission = LmsSubmission;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LmsSubmission.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => LmsAssignment_1.LmsAssignment, (a) => a.submissions, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'assignmentId' }),
    __metadata("design:type", LmsAssignment_1.LmsAssignment)
], LmsSubmission.prototype, "assignment", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LmsSubmission.prototype, "assignmentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], LmsSubmission.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LmsSubmission.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "textAnswer", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "fileKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "fileOriginalName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "fileMimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], LmsSubmission.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.LmsSubmissionStatus, default: enums_1.LmsSubmissionStatus.SUBMITTED }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'numeric', precision: 6, scale: 2, nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "grade", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "feedback", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'gradedById' }),
    __metadata("design:type", Staff_1.Staff)
], LmsSubmission.prototype, "gradedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LmsSubmission.prototype, "gradedById", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], LmsSubmission.prototype, "gradedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], LmsSubmission.prototype, "submittedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LmsSubmission.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], LmsSubmission.prototype, "updatedAt", void 0);
exports.LmsSubmission = LmsSubmission = __decorate([
    (0, typeorm_1.Entity)('lms_submissions'),
    (0, typeorm_1.Unique)(['assignmentId', 'studentId']),
    (0, typeorm_1.Index)(['studentId', 'submittedAt'])
], LmsSubmission);
