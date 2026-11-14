import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AttendanceMode,
  LessonContentType,
  LibraryResourceType,
  LmsAssignmentStatus,
  LmsSubmissionStatus,
  UserRole,
  VirtualClassProvider,
  VirtualClassStatus,
} from '../entities/enums';

export class CreateLmsAssignmentDto {
  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxScore?: number;

  @IsOptional()
  @IsEnum(LmsAssignmentStatus)
  status?: LmsAssignmentStatus;
}

export class UpdateLmsAssignmentDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxScore?: number | null;

  @IsOptional()
  @IsEnum(LmsAssignmentStatus)
  status?: LmsAssignmentStatus;
}

export class CreateLmsSubmissionDto {
  @IsOptional()
  @IsString()
  textAnswer?: string;
}

export class GradeLmsSubmissionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grade!: number;

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsEnum(LmsSubmissionStatus)
  status?: LmsSubmissionStatus;
}

export class CreateLessonContentDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(LessonContentType)
  contentType!: LessonContentType;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateLessonContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(LessonContentType)
  contentType?: LessonContentType;

  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreateVirtualClassDto {
  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(VirtualClassProvider)
  provider?: VirtualClassProvider;

  @IsOptional()
  @IsString()
  joinUrl?: string;

  @IsOptional()
  @IsString()
  hostUrl?: string;
}

export class UpdateVirtualClassDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsEnum(VirtualClassStatus)
  status?: VirtualClassStatus;

  @IsOptional()
  @IsString()
  joinUrl?: string | null;

  @IsOptional()
  @IsString()
  hostUrl?: string | null;
}

export class CreateClassRecordingDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  recordingUrl!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class CreateLibraryResourceDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(LibraryResourceType)
  resourceType!: LibraryResourceType;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  gradeFormId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  accessRoles?: UserRole[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateLibraryResourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(LibraryResourceType)
  resourceType?: LibraryResourceType;

  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeFormId?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  accessRoles?: UserRole[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class HybridAttendanceRecordDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(['present', 'absent', 'late', 'excused'] as const)
  status!: 'present' | 'absent' | 'late' | 'excused';

  @IsOptional()
  @IsEnum(AttendanceMode)
  mode?: AttendanceMode;

  @IsOptional()
  @IsString()
  remarks?: string;
}
