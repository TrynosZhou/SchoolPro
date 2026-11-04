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
exports.LearningSchedule = void 0;
const typeorm_1 = require("typeorm");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
const Term_1 = require("./Term");
const Staff_1 = require("./Staff");
let LearningSchedule = class LearningSchedule {
};
exports.LearningSchedule = LearningSchedule;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LearningSchedule.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], LearningSchedule.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LearningSchedule.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], LearningSchedule.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LearningSchedule.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], LearningSchedule.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LearningSchedule.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "weekStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "weekEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "topics", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "objectives", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "resources", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], LearningSchedule.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LearningSchedule.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LearningSchedule.prototype, "createdAt", void 0);
exports.LearningSchedule = LearningSchedule = __decorate([
    (0, typeorm_1.Entity)('learning_schedules')
], LearningSchedule);
