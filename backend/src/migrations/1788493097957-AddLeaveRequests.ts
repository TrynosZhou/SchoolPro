import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveRequests1788493097957 implements MigrationInterface {
  name = 'AddLeaveRequests1788493097957';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "staffId" uuid NOT NULL,
        "leaveType" character varying(24) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "days" numeric(6,2) NOT NULL,
        "reason" text,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "requestedById" uuid,
        "reviewedById" uuid,
        "reviewedAt" TIMESTAMP,
        "reviewNote" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_requests_staff" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leave_requests_staff" ON "leave_requests" ("staffId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leave_requests_status" ON "leave_requests" ("status")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_leave_requests_dates" ON "leave_requests" ("startDate", "endDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leave_requests_dates"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leave_requests_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leave_requests_staff"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
  }
}
