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
exports.ResultsPublication = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const Term_1 = require("./Term");
const ExamType_1 = require("./ExamType");
const User_1 = require("./User");
let ResultsPublication = class ResultsPublication {
};
exports.ResultsPublication = ResultsPublication;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ResultsPublication.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Term_1.Term, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'termId' }),
    __metadata("design:type", Term_1.Term)
], ResultsPublication.prototype, "term", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ResultsPublication.prototype, "termId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ExamType_1.ExamType, constraints_1.FK_RESTRICT),
    (0, typeorm_1.JoinColumn)({ name: 'examTypeId' }),
    __metadata("design:type", ExamType_1.ExamType)
], ResultsPublication.prototype, "examType", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ResultsPublication.prototype, "examTypeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], ResultsPublication.prototype, "publishedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { nullable: true, ...constraints_1.FK_RESTRICT }),
    (0, typeorm_1.JoinColumn)({ name: 'publishedByUserId' }),
    __metadata("design:type", User_1.User)
], ResultsPublication.prototype, "publishedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ResultsPublication.prototype, "publishedByUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ResultsPublication.prototype, "reportCardCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ResultsPublication.prototype, "whatsappSent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ResultsPublication.prototype, "smsSent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ResultsPublication.prototype, "notificationsCreated", void 0);
exports.ResultsPublication = ResultsPublication = __decorate([
    (0, typeorm_1.Entity)('results_publications'),
    (0, typeorm_1.Unique)(['termId', 'examTypeId'])
], ResultsPublication);
