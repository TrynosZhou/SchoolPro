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
exports.BulkMessage = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const User_1 = require("./User");
const BulkMessageRecipient_1 = require("./BulkMessageRecipient");
/**
 * A bulk SMS/email campaign sent to a selected class, grade/form, or custom
 * group of students/parents. Keeps a delivery log via {@link BulkMessageRecipient}.
 */
let BulkMessage = class BulkMessage {
};
exports.BulkMessage = BulkMessage;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BulkMessage.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'senderId' }),
    __metadata("design:type", User_1.User)
], BulkMessage.prototype, "sender", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], BulkMessage.prototype, "senderId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], BulkMessage.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], BulkMessage.prototype, "body", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Array)
], BulkMessage.prototype, "channels", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], BulkMessage.prototype, "audience", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], BulkMessage.prototype, "audienceLabel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], BulkMessage.prototype, "totalRecipients", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], BulkMessage.prototype, "sentCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], BulkMessage.prototype, "failedCount", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => BulkMessageRecipient_1.BulkMessageRecipient, (r) => r.bulkMessage),
    __metadata("design:type", Array)
], BulkMessage.prototype, "recipients", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], BulkMessage.prototype, "createdAt", void 0);
exports.BulkMessage = BulkMessage = __decorate([
    (0, typeorm_1.Entity)('bulk_messages')
], BulkMessage);
