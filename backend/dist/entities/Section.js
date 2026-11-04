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
exports.Section = void 0;
const typeorm_1 = require("typeorm");
const Form_1 = require("./Form");
const SchoolClass_1 = require("./SchoolClass");
const constraints_1 = require("./constraints");
let Section = class Section {
};
exports.Section = Section;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Section.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Section.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Section.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Form_1.Form, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'formId' }),
    __metadata("design:type", Form_1.Form)
], Section.prototype, "form", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Section.prototype, "formId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Section.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => SchoolClass_1.SchoolClass, (c) => c.section),
    __metadata("design:type", Array)
], Section.prototype, "classes", void 0);
exports.Section = Section = __decorate([
    (0, typeorm_1.Entity)('sections')
], Section);
