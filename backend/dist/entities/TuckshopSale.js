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
exports.TuckshopSale = void 0;
const typeorm_1 = require("typeorm");
const Student_1 = require("./Student");
const TuckshopItem_1 = require("./TuckshopItem");
let TuckshopSale = class TuckshopSale {
};
exports.TuckshopSale = TuckshopSale;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TuckshopSale.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Student_1.Student, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'studentId' }),
    __metadata("design:type", Student_1.Student)
], TuckshopSale.prototype, "student", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], TuckshopSale.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => TuckshopItem_1.TuckshopItem),
    (0, typeorm_1.JoinColumn)({ name: 'itemId' }),
    __metadata("design:type", TuckshopItem_1.TuckshopItem)
], TuckshopSale.prototype, "item", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TuckshopSale.prototype, "itemId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], TuckshopSale.prototype, "quantity", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], TuckshopSale.prototype, "totalAmount", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TuckshopSale.prototype, "soldAt", void 0);
exports.TuckshopSale = TuckshopSale = __decorate([
    (0, typeorm_1.Entity)('tuckshop_sales')
], TuckshopSale);
