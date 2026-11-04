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
exports.LibraryResource = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Subject_1 = require("./Subject");
const Form_1 = require("./Form");
const User_1 = require("./User");
const enums_1 = require("./enums");
const LibraryBookmark_1 = require("./LibraryBookmark");
let LibraryResource = class LibraryResource {
};
exports.LibraryResource = LibraryResource;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LibraryResource.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LibraryResource.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.LibraryResourceType, default: enums_1.LibraryResourceType.PDF }),
    __metadata("design:type", String)
], LibraryResource.prototype, "resourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "fileKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "fileOriginalName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "fileMimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], LibraryResource.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "externalUrl", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], LibraryResource.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Form_1.Form, { nullable: true, ...constraints_1.FK_SET_NULL }),
    (0, typeorm_1.JoinColumn)({ name: 'gradeFormId' }),
    __metadata("design:type", Form_1.Form)
], LibraryResource.prototype, "gradeForm", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], LibraryResource.prototype, "gradeFormId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'uploadedById' }),
    __metadata("design:type", User_1.User)
], LibraryResource.prototype, "uploadedBy", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LibraryResource.prototype, "uploadedById", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', array: true, default: '{}' }),
    __metadata("design:type", Array)
], LibraryResource.prototype, "accessRoles", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], LibraryResource.prototype, "isPublished", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => LibraryBookmark_1.LibraryBookmark, (b) => b.resource),
    __metadata("design:type", Array)
], LibraryResource.prototype, "bookmarks", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LibraryResource.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], LibraryResource.prototype, "updatedAt", void 0);
exports.LibraryResource = LibraryResource = __decorate([
    (0, typeorm_1.Entity)('library_resources'),
    (0, typeorm_1.Index)(['subjectId', 'resourceType']),
    (0, typeorm_1.Index)(['gradeFormId', 'resourceType'])
], LibraryResource);
