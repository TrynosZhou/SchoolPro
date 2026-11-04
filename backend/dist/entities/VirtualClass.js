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
exports.VirtualClass = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const SchoolClass_1 = require("./SchoolClass");
const Subject_1 = require("./Subject");
const Staff_1 = require("./Staff");
const enums_1 = require("./enums");
const ClassRecording_1 = require("./ClassRecording");
let VirtualClass = class VirtualClass {
};
exports.VirtualClass = VirtualClass;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], VirtualClass.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SchoolClass_1.SchoolClass, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'classId' }),
    __metadata("design:type", SchoolClass_1.SchoolClass)
], VirtualClass.prototype, "schoolClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], VirtualClass.prototype, "classId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Subject_1.Subject, { nullable: true, ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'subjectId' }),
    __metadata("design:type", Subject_1.Subject)
], VirtualClass.prototype, "subject", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], VirtualClass.prototype, "subjectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'teacherId' }),
    __metadata("design:type", Staff_1.Staff)
], VirtualClass.prototype, "teacher", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], VirtualClass.prototype, "teacherId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], VirtualClass.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], VirtualClass.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], VirtualClass.prototype, "startsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], VirtualClass.prototype, "endsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.VirtualClassProvider, default: enums_1.VirtualClassProvider.MANUAL }),
    __metadata("design:type", String)
], VirtualClass.prototype, "provider", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: enums_1.VirtualClassStatus, default: enums_1.VirtualClassStatus.SCHEDULED }),
    __metadata("design:type", String)
], VirtualClass.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], VirtualClass.prototype, "joinUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], VirtualClass.prototype, "hostUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], VirtualClass.prototype, "externalMeetingId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], VirtualClass.prototype, "providerMeta", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ClassRecording_1.ClassRecording, (r) => r.virtualClass),
    __metadata("design:type", Array)
], VirtualClass.prototype, "recordings", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], VirtualClass.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], VirtualClass.prototype, "updatedAt", void 0);
exports.VirtualClass = VirtualClass = __decorate([
    (0, typeorm_1.Entity)('virtual_classes'),
    (0, typeorm_1.Index)(['classId', 'startsAt'])
], VirtualClass);
