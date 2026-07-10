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
exports.BulkMessageRecipient = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const BulkMessage_1 = require("./BulkMessage");
/** Per-recipient delivery record for a {@link BulkMessage} (the delivery log). */
let BulkMessageRecipient = class BulkMessageRecipient {
};
exports.BulkMessageRecipient = BulkMessageRecipient;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "bulkMessageId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => BulkMessage_1.BulkMessage, (m) => m.recipients, { ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'bulkMessageId' }),
    __metadata("design:type", BulkMessage_1.BulkMessage)
], BulkMessageRecipient.prototype, "bulkMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "recipientName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16, default: 'parent' }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "recipientType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16 }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "destination", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 16 }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], BulkMessageRecipient.prototype, "error", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], BulkMessageRecipient.prototype, "createdAt", void 0);
exports.BulkMessageRecipient = BulkMessageRecipient = __decorate([
    (0, typeorm_1.Entity)('bulk_message_recipients')
], BulkMessageRecipient);
