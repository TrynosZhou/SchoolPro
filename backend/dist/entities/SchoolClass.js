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
exports.SchoolClass = void 0;
const typeorm_1 = require("typeorm");
const Form_1 = require("./Form");
const Student_1 = require("./Student");
const ClassSubject_1 = require("./ClassSubject");
const Staff_1 = require("./Staff");
const constraints_1 = require("./constraints");
let SchoolClass = class SchoolClass {
};
exports.SchoolClass = SchoolClass;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], SchoolClass.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SchoolClass.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Form_1.Form, (f) => f.classes, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'formId' }),
    __metadata("design:type", Form_1.Form)
], SchoolClass.prototype, "form", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], SchoolClass.prototype, "formId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff_1.Staff, { ...constraints_1.FK_SET_NULL, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'classTeacherId' }),
    __metadata("design:type", Staff_1.Staff)
], SchoolClass.prototype, "classTeacher", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], SchoolClass.prototype, "classTeacherId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SchoolClass.prototype, "capacity", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Student_1.Student, (s) => s.schoolClass),
    __metadata("design:type", Array)
], SchoolClass.prototype, "students", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ClassSubject_1.ClassSubject, (cs) => cs.schoolClass),
    __metadata("design:type", Array)
], SchoolClass.prototype, "classSubjects", void 0);
exports.SchoolClass = SchoolClass = __decorate([
    (0, typeorm_1.Entity)('classes')
], SchoolClass);
