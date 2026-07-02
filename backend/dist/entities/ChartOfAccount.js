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
exports.ChartOfAccount = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
let ChartOfAccount = class ChartOfAccount {
};
exports.ChartOfAccount = ChartOfAccount;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ChartOfAccount.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true, length: 32 }),
    __metadata("design:type", String)
], ChartOfAccount.prototype, "accountCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], ChartOfAccount.prototype, "accountName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.GlAccountType }),
    __metadata("design:type", String)
], ChartOfAccount.prototype, "accountType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], ChartOfAccount.prototype, "parentAccountId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ChartOfAccount, (a) => a.subAccounts, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'parentAccountId' }),
    __metadata("design:type", ChartOfAccount)
], ChartOfAccount.prototype, "parentAccount", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ChartOfAccount, (a) => a.parentAccount),
    __metadata("design:type", Array)
], ChartOfAccount.prototype, "subAccounts", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ChartOfAccount.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ChartOfAccount.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ChartOfAccount.prototype, "updatedAt", void 0);
exports.ChartOfAccount = ChartOfAccount = __decorate([
    (0, typeorm_1.Entity)('chart_of_accounts'),
    (0, typeorm_1.Index)('idx_chart_of_accounts_type', ['accountType'])
], ChartOfAccount);
