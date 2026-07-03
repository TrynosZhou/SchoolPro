import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek, LessonLength, TeacherAssignmentRole } from '../entities/enums';

export class CreateTeacherAssignmentDto {
  @IsUUID()
  teacherId!: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsEnum(TeacherAssignmentRole)
  role!: TeacherAssignmentRole;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyPeriods?: number;

  @IsOptional()
  @IsEnum(LessonLength)
  lessonLength?: LessonLength;

  @IsOptional()
  @IsBoolean()
  isSharedSplit?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  forceReassign?: boolean;
}

export class UpdateTeacherAssignmentDto {
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyPeriods?: number;

  @IsOptional()
  @IsEnum(LessonLength)
  lessonLength?: LessonLength;

  @IsOptional()
  @IsBoolean()
  isSharedSplit?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  forceReassign?: boolean;
}

export class BulkTeacherAssignmentRowDto {
  @IsUUID()
  teacherId!: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsEnum(TeacherAssignmentRole)
  role!: TeacherAssignmentRole;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyPeriods?: number;

  @IsOptional()
  @IsEnum(LessonLength)
  lessonLength?: LessonLength;

  @IsOptional()
  @IsBoolean()
  isSharedSplit?: boolean;
}

export class BulkTeacherAssignmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTeacherAssignmentRowDto)
  assignments!: BulkTeacherAssignmentRowDto[];

  @IsOptional()
  @IsBoolean()
  forceReassign?: boolean;
}

export class CreateTimetableSlotDto {
  @IsUUID()
  teacherAssignmentId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsInt()
  @Min(1)
  periodNumber!: number;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsUUID()
  timetableEntryId?: string;
}

export class UpdateTimetableSlotDto {
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;
}
