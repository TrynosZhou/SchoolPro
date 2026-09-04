"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Recalculates letter grades on existing exam_marks rows using the school's
 * current grade boundaries and each exam type's maxMarks.
 *
 * Run: npm run exams:recalculate-grades
 * Dry run: npm run exams:recalculate-grades -- --dry-run
 */
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_service_1 = require("../services/grade.service");
const grade_boundaries_1 = require("../types/grade-boundaries");
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await data_source_1.AppDataSource.initialize();
    const boundaries = await (0, grade_service_1.getGradeBoundaries)();
    console.log('Grade boundaries in use:');
    for (const b of [...boundaries].sort((a, b) => b.minPercent - a.minPercent)) {
        const label = b.label ? ` (${b.label})` : '';
        console.log(`  ${b.grade}${label}: >= ${b.minPercent}%`);
    }
    if (dryRun)
        console.log('\nDry run — no changes will be saved.\n');
    const markRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamMark);
    const examTypeRepo = data_source_1.AppDataSource.getRepository(entities_1.ExamType);
    const examTypes = await examTypeRepo.find();
    const maxByExamType = new Map(examTypes.map((t) => [t.id, Number(t.maxMarks) || 100]));
    const marks = await markRepo.find({
        relations: { examType: true },
        order: { updatedAt: 'ASC' },
    });
    console.log(`Found ${marks.length} exam mark row(s).\n`);
    let unchanged = 0;
    let updated = 0;
    const changes = [];
    for (const mark of marks) {
        const maxMarks = maxByExamType.get(mark.examTypeId) ?? Number(mark.examType?.maxMarks) ?? 100;
        const numericMarks = Number(mark.marks);
        const newGrade = (0, grade_boundaries_1.calculateGradeFromBoundaries)(numericMarks, maxMarks, boundaries);
        const oldGrade = (mark.grade || '').trim();
        if (oldGrade === newGrade) {
            unchanged += 1;
            continue;
        }
        changes.push({
            id: mark.id,
            marks: numericMarks,
            oldGrade: oldGrade || '—',
            newGrade,
            examType: mark.examType?.name || mark.examTypeId,
        });
        if (!dryRun) {
            mark.grade = newGrade;
            await markRepo.save(mark);
        }
        updated += 1;
    }
    const preview = changes.slice(0, 25);
    for (const row of preview) {
        console.log(`${dryRun ? 'WOULD UPDATE' : 'UPDATED'} mark ${row.id}: ${row.marks} (${row.examType}) ${row.oldGrade} → ${row.newGrade}`);
    }
    if (changes.length > preview.length) {
        console.log(`… and ${changes.length - preview.length} more change(s).`);
    }
    console.log('\nDone.');
    console.log(`  Total marks: ${marks.length}`);
    console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    if (dryRun && updated)
        console.log('  Re-run without --dry-run to apply changes.');
    if (!dryRun && updated) {
        console.log('\nTip: regenerate report cards from Admin if published cards need matching grades.');
    }
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (err) => {
    console.error(err);
    if (data_source_1.AppDataSource.isInitialized)
        await data_source_1.AppDataSource.destroy();
    process.exit(1);
});
