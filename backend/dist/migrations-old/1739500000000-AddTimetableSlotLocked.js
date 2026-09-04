"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddTimetableSlotLocked1739500000000 = void 0;
class AddTimetableSlotLocked1739500000000 {
    constructor() {
        this.name = 'AddTimetableSlotLocked1739500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "timetables"
      ADD COLUMN IF NOT EXISTS "isLocked" boolean NOT NULL DEFAULT false
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "timetables" DROP COLUMN IF EXISTS "isLocked"
    `);
    }
}
exports.AddTimetableSlotLocked1739500000000 = AddTimetableSlotLocked1739500000000;
