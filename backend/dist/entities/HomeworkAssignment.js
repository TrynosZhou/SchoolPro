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
exports.HomeworkAssignment = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
const Term_1 = require("./Term");
const Staff_1 = require("./Staff");
let HomeworkAssignment = class HomeworkAssignment {
};
exports.HomeworkAssignment = HomeworkAssignment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], HomeworkAssignment.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, { nullable: true, ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], HomeworkAssignment.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], HomeworkAssignment.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], HomeworkAssignment.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "instructions", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "originalFileName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "storedFileName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], HomeworkAssignment.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", String)
], HomeworkAssignment.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], HomeworkAssignment.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], HomeworkAssignment.prototype, "updatedAt", void 0);
exports.HomeworkAssignment = HomeworkAssignment = __decorate([
    (0, typeorm_1.Entity)('homework_assignments')
], HomeworkAssignment);
