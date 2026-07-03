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
exports.UpdateTimetableSlotDto = exports.CreateTimetableSlotDto = exports.BulkTeacherAssignmentDto = exports.BulkTeacherAssignmentRowDto = exports.UpdateTeacherAssignmentDto = exports.CreateTeacherAssignmentDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const enums_1 = require("../entities/enums");
class CreateTeacherAssignmentDto {
}
exports.CreateTeacherAssignmentDto = CreateTeacherAssignmentDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "teacherId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "classId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "sectionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "subjectId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.TeacherAssignmentRole),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "startDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTeacherAssignmentDto.prototype, "weeklyPeriods", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(enums_1.LessonLength),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "lessonLength", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateTeacherAssignmentDto.prototype, "isSharedSplit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTeacherAssignmentDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateTeacherAssignmentDto.prototype, "forceReassign", void 0);
class UpdateTeacherAssignmentDto {
}
exports.UpdateTeacherAssignmentDto = UpdateTeacherAssignmentDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateTeacherAssignmentDto.prototype, "teacherId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateTeacherAssignmentDto.prototype, "subjectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateTeacherAssignmentDto.prototype, "endDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateTeacherAssignmentDto.prototype, "isActive", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateTeacherAssignmentDto.prototype, "weeklyPeriods", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(enums_1.LessonLength),
    __metadata("design:type", String)
], UpdateTeacherAssignmentDto.prototype, "lessonLength", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateTeacherAssignmentDto.prototype, "isSharedSplit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTeacherAssignmentDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateTeacherAssignmentDto.prototype, "forceReassign", void 0);
class BulkTeacherAssignmentRowDto {
}
exports.BulkTeacherAssignmentRowDto = BulkTeacherAssignmentRowDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "teacherId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "classId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "sectionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "subjectId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.TeacherAssignmentRole),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], BulkTeacherAssignmentRowDto.prototype, "weeklyPeriods", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(enums_1.LessonLength),
    __metadata("design:type", String)
], BulkTeacherAssignmentRowDto.prototype, "lessonLength", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkTeacherAssignmentRowDto.prototype, "isSharedSplit", void 0);
class BulkTeacherAssignmentDto {
}
exports.BulkTeacherAssignmentDto = BulkTeacherAssignmentDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BulkTeacherAssignmentRowDto),
    __metadata("design:type", Array)
], BulkTeacherAssignmentDto.prototype, "assignments", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkTeacherAssignmentDto.prototype, "forceReassign", void 0);
class CreateTimetableSlotDto {
}
exports.CreateTimetableSlotDto = CreateTimetableSlotDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTimetableSlotDto.prototype, "teacherAssignmentId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(enums_1.DayOfWeek),
    __metadata("design:type", String)
], CreateTimetableSlotDto.prototype, "dayOfWeek", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateTimetableSlotDto.prototype, "periodNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTimetableSlotDto.prototype, "startTime", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTimetableSlotDto.prototype, "endTime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateTimetableSlotDto.prototype, "timetableEntryId", void 0);
class UpdateTimetableSlotDto {
}
exports.UpdateTimetableSlotDto = UpdateTimetableSlotDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(enums_1.DayOfWeek),
    __metadata("design:type", String)
], UpdateTimetableSlotDto.prototype, "dayOfWeek", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdateTimetableSlotDto.prototype, "periodNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTimetableSlotDto.prototype, "startTime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTimetableSlotDto.prototype, "endTime", void 0);
