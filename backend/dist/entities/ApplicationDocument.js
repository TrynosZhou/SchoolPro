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
exports.ApplicationDocument = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const enums_1 = require("./enums");
const Application_1 = require("./Application");
/** A supporting document (birth certificate, report card, photo, ID) uploaded with an application. */
let ApplicationDocument = class ApplicationDocument {
};
exports.ApplicationDocument = ApplicationDocument;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "applicationId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Application_1.Application, (application) => application.documents, { ...constraints_1.FK_CASCADE }),
    (0, typeorm_1.JoinColumn)({ name: 'applicationId' }),
    __metadata("design:type", Application_1.Application)
], ApplicationDocument.prototype, "application", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, default: enums_1.ApplicationDocumentType.OTHER }),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "docType", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "originalName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "storedName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ApplicationDocument.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], ApplicationDocument.prototype, "sizeBytes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ApplicationDocument.prototype, "createdAt", void 0);
exports.ApplicationDocument = ApplicationDocument = __decorate([
    (0, typeorm_1.Entity)('application_documents')
], ApplicationDocument);
