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
exports.TimetableSlot = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const TeacherAssignment_1 = require("./TeacherAssignment");
const Timetable_1 = require("./Timetable");
let TimetableSlot = class TimetableSlot {
};
exports.TimetableSlot = TimetableSlot;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TimetableSlot.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => TeacherAssignment_1.TeacherAssignment, (a) => a.timetableSlots, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'teacherAssignmentId' }),
    __metadata("design:type", TeacherAssignment_1.TeacherAssignment)
], TimetableSlot.prototype, "assignment", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TimetableSlot.prototype, "teacherAssignmentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Timetable_1.Timetable, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'timetableEntryId' }),
    __metadata("design:type", Timetable_1.Timetable)
], TimetableSlot.prototype, "timetableEntry", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], TimetableSlot.prototype, "timetableEntryId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16 }),
    __metadata("design:type", String)
], TimetableSlot.prototype, "dayOfWeek", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], TimetableSlot.prototype, "periodNumber", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 8 }),
    __metadata("design:type", String)
], TimetableSlot.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 8 }),
    __metadata("design:type", String)
], TimetableSlot.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TimetableSlot.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], TimetableSlot.prototype, "updatedAt", void 0);
exports.TimetableSlot = TimetableSlot = __decorate([
    (0, typeorm_1.Entity)('timetable_slots')
], TimetableSlot);
