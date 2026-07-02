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
exports.Timetable = void 0;
const typeorm_1 = require("typeorm");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
const Staff_1 = require("./Staff");
let Timetable = class Timetable {
};
exports.Timetable = Timetable;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Timetable.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], Timetable.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Timetable.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], Timetable.prototype, "dayOfWeek", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Timetable.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Timetable.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], Timetable.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Timetable.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], Timetable.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Timetable.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Timetable.prototype, "room", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Timetable.prototype, "isLocked", void 0);
exports.Timetable = Timetable = __decorate([
    (0, typeorm_1.Entity)('timetables')
], Timetable);
