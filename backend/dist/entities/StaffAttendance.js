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
exports.StaffAttendance = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
let StaffAttendance = class StaffAttendance {
};
exports.StaffAttendance = StaffAttendance;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StaffAttendance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'staffId' }),
    __metadata("design:type", Staff_1.Staff)
], StaffAttendance.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StaffAttendance.prototype, "staffId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], StaffAttendance.prototype, "date", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.AttendanceStatus }),
    __metadata("design:type", String)
], StaffAttendance.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffAttendance.prototype, "markedById", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], StaffAttendance.prototype, "remarks", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StaffAttendance.prototype, "createdAt", void 0);
exports.StaffAttendance = StaffAttendance = __decorate([
    (0, typeorm_1.Entity)('staff_attendance'),
    (0, typeorm_1.Unique)(['staffId', 'date'])
], StaffAttendance);
