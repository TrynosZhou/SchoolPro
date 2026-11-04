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
exports.RecordBookColumn = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Term_1 = require("./Term");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
let RecordBookColumn = class RecordBookColumn {
};
exports.RecordBookColumn = RecordBookColumn;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], RecordBookColumn.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], RecordBookColumn.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], RecordBookColumn.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "ownerKey", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "columnKey", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecordBookColumn.prototype, "label", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], RecordBookColumn.prototype, "sortOrder", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], RecordBookColumn.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], RecordBookColumn.prototype, "updatedAt", void 0);
exports.RecordBookColumn = RecordBookColumn = __decorate([
    (0, typeorm_1.Entity)('record_book_columns'),
    (0, typeorm_1.Unique)(['termId', 'classId', 'ownerKey', 'subjectId', 'columnKey'])
], RecordBookColumn);
