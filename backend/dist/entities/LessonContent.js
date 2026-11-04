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
exports.LessonContent = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
const Term_1 = require("./Term");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
let LessonContent = class LessonContent {
};
exports.LessonContent = LessonContent;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LessonContent.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, { nullable: true, ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], LessonContent.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], LessonContent.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LessonContent.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, { nullable: true, ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], LessonContent.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'uploadedById' }),
    __metadata("design:type", Staff_1.Staff)
], LessonContent.prototype, "uploadedBy", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LessonContent.prototype, "uploadedById", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LessonContent.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.LessonContentType, default: enums_1.LessonContentType.NOTE }),
    __metadata("design:type", String)
], LessonContent.prototype, "contentType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "externalUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "fileKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "fileOriginalName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LessonContent.prototype, "fileMimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], LessonContent.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], LessonContent.prototype, "sortOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], LessonContent.prototype, "isPublished", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], LessonContent.prototype, "publishedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LessonContent.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], LessonContent.prototype, "updatedAt", void 0);
exports.LessonContent = LessonContent = __decorate([
    (0, typeorm_1.Entity)('lesson_contents'),
    (0, typeorm_1.Index)(['classId', 'subjectId', 'publishedAt'])
], LessonContent);
