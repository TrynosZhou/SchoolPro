import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLmsLibraryAndHybridLearning1741900000000 implements MigrationInterface {
  name = 'AddLmsLibraryAndHybridLearning1741900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "lms_assignment_status_enum" AS ENUM ('draft', 'published', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "lms_submission_status_enum" AS ENUM ('submitted', 'late', 'graded', 'returned')
    `);
    await queryRunner.query(`
      CREATE TYPE "lesson_content_type_enum" AS ENUM ('video', 'note', 'link', 'document', 'other')
    `);
    await queryRunner.query(`
      CREATE TYPE "virtual_class_provider_enum" AS ENUM ('manual', 'zoom', 'google_meet')
    `);
    await queryRunner.query(`
      CREATE TYPE "virtual_class_status_enum" AS ENUM ('scheduled', 'live', 'ended', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "attendance_mode_enum" AS ENUM ('in_person', 'remote')
    `);
    await queryRunner.query(`
      CREATE TYPE "library_resource_type_enum" AS ENUM ('book', 'pdf', 'video', 'audio', 'link', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "student_attendance"
      ADD COLUMN IF NOT EXISTS "mode" "attendance_mode_enum" NOT NULL DEFAULT 'in_person'
    `);

    await queryRunner.query(`
      CREATE TABLE "lms_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classId" uuid NOT NULL,
        "subjectId" uuid,
        "termId" uuid,
        "teacherId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "dueAt" TIMESTAMPTZ,
        "maxScore" numeric(6,2),
        "status" "lms_assignment_status_enum" NOT NULL DEFAULT 'draft',
        "attachmentKey" character varying,
        "attachmentOriginalName" character varying,
        "attachmentMimeType" character varying,
        "attachmentSize" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lms_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lms_assignments_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_lms_assignments_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_lms_assignments_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_lms_assignments_teacher" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lms_assignments_class_subject_due"
      ON "lms_assignments" ("classId", "subjectId", "dueAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "lms_submissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "assignmentId" uuid NOT NULL,
        "studentId" uuid NOT NULL,
        "textAnswer" text,
        "fileKey" character varying,
        "fileOriginalName" character varying,
        "fileMimeType" character varying,
        "fileSize" integer,
        "status" "lms_submission_status_enum" NOT NULL DEFAULT 'submitted',
        "grade" numeric(6,2),
        "feedback" text,
        "gradedById" uuid,
        "gradedAt" TIMESTAMPTZ,
        "submittedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lms_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lms_submissions_assignment_student" UNIQUE ("assignmentId", "studentId"),
        CONSTRAINT "FK_lms_submissions_assignment" FOREIGN KEY ("assignmentId") REFERENCES "lms_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_lms_submissions_student" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_lms_submissions_graded_by" FOREIGN KEY ("gradedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lms_submissions_student_submitted"
      ON "lms_submissions" ("studentId", "submittedAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "lesson_contents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classId" uuid,
        "subjectId" uuid NOT NULL,
        "termId" uuid,
        "uploadedById" uuid NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "contentType" "lesson_content_type_enum" NOT NULL DEFAULT 'note',
        "externalUrl" text,
        "fileKey" character varying,
        "fileOriginalName" character varying,
        "fileMimeType" character varying,
        "fileSize" integer,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isPublished" boolean NOT NULL DEFAULT true,
        "publishedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lesson_contents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lesson_contents_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_lesson_contents_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_lesson_contents_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_lesson_contents_uploader" FOREIGN KEY ("uploadedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_lesson_contents_class_subject_published"
      ON "lesson_contents" ("classId", "subjectId", "publishedAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "virtual_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classId" uuid NOT NULL,
        "subjectId" uuid,
        "teacherId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "startsAt" TIMESTAMPTZ NOT NULL,
        "endsAt" TIMESTAMPTZ,
        "provider" "virtual_class_provider_enum" NOT NULL DEFAULT 'manual',
        "status" "virtual_class_status_enum" NOT NULL DEFAULT 'scheduled',
        "joinUrl" text,
        "hostUrl" text,
        "externalMeetingId" character varying,
        "providerMeta" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_virtual_classes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_virtual_classes_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_virtual_classes_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_virtual_classes_teacher" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_virtual_classes_class_starts"
      ON "virtual_classes" ("classId", "startsAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "class_recordings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "virtualClassId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "recordingUrl" text NOT NULL,
        "fileKey" character varying,
        "durationSeconds" integer,
        "recordedAt" TIMESTAMPTZ,
        "providerMeta" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_class_recordings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_class_recordings_virtual_class" FOREIGN KEY ("virtualClassId") REFERENCES "virtual_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_class_recordings_virtual_recorded"
      ON "class_recordings" ("virtualClassId", "recordedAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "library_resources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text,
        "resourceType" "library_resource_type_enum" NOT NULL DEFAULT 'pdf',
        "fileKey" character varying,
        "fileOriginalName" character varying,
        "fileMimeType" character varying,
        "fileSize" integer,
        "externalUrl" text,
        "subjectId" uuid,
        "gradeFormId" uuid,
        "uploadedById" uuid NOT NULL,
        "accessRoles" text array NOT NULL DEFAULT '{}',
        "isPublished" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_library_resources" PRIMARY KEY ("id"),
        CONSTRAINT "FK_library_resources_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "FK_library_resources_form" FOREIGN KEY ("gradeFormId") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "FK_library_resources_uploader" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_library_resources_subject_type"
      ON "library_resources" ("subjectId", "resourceType")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_library_resources_grade_type"
      ON "library_resources" ("gradeFormId", "resourceType")
    `);

    await queryRunner.query(`
      CREATE TABLE "library_bookmarks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "resourceId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_library_bookmarks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_library_bookmarks_user_resource" UNIQUE ("userId", "resourceId"),
        CONSTRAINT "FK_library_bookmarks_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_library_bookmarks_resource" FOREIGN KEY ("resourceId") REFERENCES "library_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "library_bookmarks"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_library_resources_grade_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_library_resources_subject_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "library_resources"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_class_recordings_virtual_recorded"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "class_recordings"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_virtual_classes_class_starts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "virtual_classes"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lesson_contents_class_subject_published"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lesson_contents"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lms_submissions_student_submitted"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lms_submissions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lms_assignments_class_subject_due"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lms_assignments"`);
    await queryRunner.query(`ALTER TABLE "student_attendance" DROP COLUMN IF EXISTS "mode"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "library_resource_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "attendance_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "virtual_class_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "virtual_class_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lesson_content_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lms_submission_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lms_assignment_status_enum"`);
  }
}
