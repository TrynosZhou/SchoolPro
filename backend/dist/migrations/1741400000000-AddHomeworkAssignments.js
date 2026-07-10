"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddHomeworkAssignments1741400000000 = void 0;
class AddHomeworkAssignments1741400000000 {
    constructor() {
        this.name = 'AddHomeworkAssignments1741400000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "homework_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classId" uuid NOT NULL,
        "subjectId" uuid,
        "termId" uuid NOT NULL,
        "teacherId" uuid NOT NULL,
        "title" character varying NOT NULL,
        "instructions" text,
        "originalFileName" character varying NOT NULL,
        "storedFileName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "fileSize" integer NOT NULL,
        "dueDate" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_homework_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_homework_assignments_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_homework_assignments_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_homework_assignments_term" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "FK_homework_assignments_teacher" FOREIGN KEY ("teacherId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_homework_assignments_class_term"
      ON "homework_assignments" ("classId", "termId", "createdAt" DESC)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_homework_assignments_class_term"`);
        await queryRunner.query(`DROP TABLE "homework_assignments"`);
    }
}
exports.AddHomeworkAssignments1741400000000 = AddHomeworkAssignments1741400000000;
