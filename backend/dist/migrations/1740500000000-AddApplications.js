"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddApplications1740500000000 = void 0;
/**
 * Admission & Enrollment: online application forms + status tracking.
 * Creates the `applications` and `application_documents` tables.
 */
class AddApplications1740500000000 {
    constructor() {
        this.name = 'AddApplications1740500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referenceNumber" character varying NOT NULL,
        "studentFirstName" character varying NOT NULL,
        "studentLastName" character varying NOT NULL,
        "dateOfBirth" date,
        "gender" character varying(16),
        "previousSchool" character varying,
        "classAppliedFor" character varying NOT NULL,
        "guardianName" character varying NOT NULL,
        "guardianRelationship" character varying(64),
        "contactPhone" character varying NOT NULL,
        "contactEmail" character varying NOT NULL,
        "address" text,
        "status" character varying(32) NOT NULL DEFAULT 'applied',
        "statusNote" text,
        "reviewedAt" TIMESTAMP,
        "submittedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_applications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_applications_reference" UNIQUE ("referenceNumber")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_status" ON "applications" ("status")
    `);
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "application_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "applicationId" uuid NOT NULL,
        "docType" character varying(32) NOT NULL DEFAULT 'other',
        "originalName" character varying NOT NULL,
        "storedName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_application_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_application_documents_application" FOREIGN KEY ("applicationId")
          REFERENCES "applications" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_documents_application"
        ON "application_documents" ("applicationId")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "application_documents"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "applications"`);
    }
}
exports.AddApplications1740500000000 = AddApplications1740500000000;
