/**
 * Recalculates letter grades on existing exam_marks rows using the school's
 * current grade boundaries and each exam type's maxMarks.
 *
 * Run: npm run exams:recalculate-grades
 * Dry run: npm run exams:recalculate-grades -- --dry-run
 */
import { AppDataSource } from '../config/data-source';
import { ExamMark, ExamType } from '../entities';
import { getGradeBoundaries } from '../services/grade.service';
import { calculateGradeFromBoundaries } from '../types/grade-boundaries';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await AppDataSource.initialize();

  const boundaries = await getGradeBoundaries();
  console.log('Grade boundaries in use:');
  for (const b of [...boundaries].sort((a, b) => b.minPercent - a.minPercent)) {
    const label = b.label ? ` (${b.label})` : '';
    console.log(`  ${b.grade}${label}: >= ${b.minPercent}%`);
  }
  if (dryRun) console.log('\nDry run — no changes will be saved.\n');

  const markRepo = AppDataSource.getRepository(ExamMark);
  const examTypeRepo = AppDataSource.getRepository(ExamType);

  const examTypes = await examTypeRepo.find();
  const maxByExamType = new Map<string, number>(
    examTypes.map((t) => [t.id, Number(t.maxMarks) || 100]),
  );

  const marks = await markRepo.find({
    relations: { examType: true },
    order: { updatedAt: 'ASC' },
  });

  console.log(`Found ${marks.length} exam mark row(s).\n`);

  let unchanged = 0;
  let updated = 0;
  const changes: { id: string; marks: number; oldGrade: string; newGrade: string; examType: string }[] = [];

  for (const mark of marks) {
    const maxMarks = maxByExamType.get(mark.examTypeId) ?? Number(mark.examType?.maxMarks) ?? 100;
    const numericMarks = Number(mark.marks);
    const newGrade = calculateGradeFromBoundaries(numericMarks, maxMarks, boundaries);
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
    console.log(
      `${dryRun ? 'WOULD UPDATE' : 'UPDATED'} mark ${row.id}: ${row.marks} (${row.examType}) ${row.oldGrade} → ${row.newGrade}`,
    );
  }
  if (changes.length > preview.length) {
    console.log(`… and ${changes.length - preview.length} more change(s).`);
  }

  console.log('\nDone.');
  console.log(`  Total marks: ${marks.length}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  if (dryRun && updated) console.log('  Re-run without --dry-run to apply changes.');
  if (!dryRun && updated) {
    console.log('\nTip: regenerate report cards from Admin if published cards need matching grades.');
  }

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
