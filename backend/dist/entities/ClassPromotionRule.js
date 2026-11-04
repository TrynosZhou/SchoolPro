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
exports.ClassPromotionRule = void 0;
const typeorm_1 = require("typeorm");
const SchoolClass_1 = require("./SchoolClass");
const constraints_1 = require("./constraints");
let ClassPromotionRule = class ClassPromotionRule {
};
exports.ClassPromotionRule = ClassPromotionRule;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ClassPromotionRule.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, { ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'fromClassId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], ClassPromotionRule.prototype, "fromClass", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], ClassPromotionRule.prototype, "fromClassId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'toClassId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], ClassPromotionRule.prototype, "toClass", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ClassPromotionRule.prototype, "toClassId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, length: 128 }),
    __metadata("design:type", String)
], ClassPromotionRule.prototype, "completionLabel", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ClassPromotionRule.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ClassPromotionRule.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ClassPromotionRule.prototype, "updatedAt", void 0);
exports.ClassPromotionRule = ClassPromotionRule = __decorate([
    (0, typeorm_1.Entity)('class_promotion_rules')
], ClassPromotionRule);
