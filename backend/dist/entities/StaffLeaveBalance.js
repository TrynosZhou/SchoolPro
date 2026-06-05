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
exports.StaffLeaveBalance = void 0;
const typeorm_1 = require("typeorm");
const Staff_1 = require("./Staff");
let StaffLeaveBalance = class StaffLeaveBalance {
};
exports.StaffLeaveBalance = StaffLeaveBalance;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StaffLeaveBalance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => Staff_1.Staff, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'staffId' }),
    __metadata("design:type", Staff_1.Staff)
], StaffLeaveBalance.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], StaffLeaveBalance.prototype, "staffId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 6, scale: 2, default: 12 }),
    __metadata("design:type", Number)
], StaffLeaveBalance.prototype, "annualEntitlementDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 8, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], StaffLeaveBalance.prototype, "balanceDays", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StaffLeaveBalance.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], StaffLeaveBalance.prototype, "updatedAt", void 0);
exports.StaffLeaveBalance = StaffLeaveBalance = __decorate([
    (0, typeorm_1.Entity)('staff_leave_balances')
], StaffLeaveBalance);
