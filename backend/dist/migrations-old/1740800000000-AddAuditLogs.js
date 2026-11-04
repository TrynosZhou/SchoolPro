"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAuditLogs1740800000000 = void 0;
/** Append-only audit trail for access-control Phase 1 foundation. */
class AddAuditLogs1740800000000 {
    constructor() {
        this.name = 'AddAuditLogs1740800000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "userRole" varchar(32) NOT NULL,
        "userEmail" varchar(160),
        "action" varchar(16) NOT NULL,
        "module" varchar(64) NOT NULL,
        "recordId" varchar(64) NOT NULL,
        "recordLabel" varchar(255),
        "changes" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId" ON "audit_logs" ("userId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_module" ON "audit_logs" ("module")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_recordId" ON "audit_logs" ("recordId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    }
}
exports.AddAuditLogs1740800000000 = AddAuditLogs1740800000000;
