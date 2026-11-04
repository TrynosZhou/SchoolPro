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
exports.ClassRecording = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const VirtualClass_1 = require("./VirtualClass");
let ClassRecording = class ClassRecording {
};
exports.ClassRecording = ClassRecording;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ClassRecording.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => VirtualClass_1.VirtualClass, (v) => v.recordings, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'virtualClassId' }),
    __metadata("design:type", VirtualClass_1.VirtualClass)
], ClassRecording.prototype, "virtualClass", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ClassRecording.prototype, "virtualClassId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ClassRecording.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], ClassRecording.prototype, "recordingUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ClassRecording.prototype, "fileKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], ClassRecording.prototype, "durationSeconds", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Date)
], ClassRecording.prototype, "recordedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], ClassRecording.prototype, "providerMeta", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ClassRecording.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ClassRecording.prototype, "updatedAt", void 0);
exports.ClassRecording = ClassRecording = __decorate([
    (0, typeorm_1.Entity)('class_recordings'),
    (0, typeorm_1.Index)(['virtualClassId', 'recordedAt'])
], ClassRecording);
