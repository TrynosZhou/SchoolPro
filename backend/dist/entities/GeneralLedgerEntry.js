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
exports.GeneralLedgerEntry = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const ChartOfAccount_1 = require("./ChartOfAccount");
const User_1 = require("./User");
let GeneralLedgerEntry = class GeneralLedgerEntry {
};
exports.GeneralLedgerEntry = GeneralLedgerEntry;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "transactionDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ChartOfAccount_1.ChartOfAccount, { ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'accountId' }),
    __metadata("design:type", ChartOfAccount_1.ChartOfAccount)
], GeneralLedgerEntry.prototype, "account", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], GeneralLedgerEntry.prototype, "debitAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], GeneralLedgerEntry.prototype, "creditAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.GlReferenceType }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "referenceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "referenceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "journalBatchId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 14, scale: 2 }),
    __metadata("design:type", Number)
], GeneralLedgerEntry.prototype, "runningBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "createdById", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'createdById' }),
    __metadata("design:type", User_1.User)
], GeneralLedgerEntry.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], GeneralLedgerEntry.prototype, "isReversed", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], GeneralLedgerEntry.prototype, "reversalOfEntryId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => GeneralLedgerEntry, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'reversalOfEntryId' }),
    __metadata("design:type", GeneralLedgerEntry)
], GeneralLedgerEntry.prototype, "reversalOfEntry", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GeneralLedgerEntry.prototype, "createdAt", void 0);
exports.GeneralLedgerEntry = GeneralLedgerEntry = __decorate([
    (0, typeorm_1.Entity)('general_ledger_entries'),
    (0, typeorm_1.Index)('idx_gl_entry_transaction_date', ['transactionDate']),
    (0, typeorm_1.Index)('idx_gl_entry_account_id', ['accountId']),
    (0, typeorm_1.Index)('idx_gl_entry_reference_type', ['referenceType']),
    (0, typeorm_1.Index)('idx_gl_entry_journal_batch', ['journalBatchId'])
], GeneralLedgerEntry);
