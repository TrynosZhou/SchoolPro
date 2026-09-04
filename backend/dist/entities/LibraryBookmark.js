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
exports.LibraryBookmark = void 0;
const typeorm_1 = require("typeorm");
const constraints_1 = require("./constraints");
const User_1 = require("./User");
const LibraryResource_1 = require("./LibraryResource");
let LibraryBookmark = class LibraryBookmark {
};
exports.LibraryBookmark = LibraryBookmark;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], LibraryBookmark.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", User_1.User)
], LibraryBookmark.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LibraryBookmark.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => LibraryResource_1.LibraryResource, (r) => r.bookmarks, constraints_1.FK_CASCADE),
    (0, typeorm_1.JoinColumn)({ name: 'resourceId' }),
    __metadata("design:type", LibraryResource_1.LibraryResource)
], LibraryBookmark.prototype, "resource", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], LibraryBookmark.prototype, "resourceId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], LibraryBookmark.prototype, "createdAt", void 0);
exports.LibraryBookmark = LibraryBookmark = __decorate([
    (0, typeorm_1.Entity)('library_bookmarks'),
    (0, typeorm_1.Unique)(['userId', 'resourceId'])
], LibraryBookmark);
