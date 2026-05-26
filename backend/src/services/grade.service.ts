import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import {
  DEFAULT_GRADE_BOUNDARIES,
  GradeBoundary,
  calculateGradeFromBoundaries,
} from '../types/grade-boundaries';

const SETTINGS_ID = 'default';

let cachedBoundaries: GradeBoundary[] | null = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

export function invalidateGradeBoundariesCache() {
  cachedBoundaries = null;
  cacheTime = 0;
}

export async function getGradeBoundaries(): Promise<GradeBoundary[]> {
  if (cachedBoundaries && Date.now() - cacheTime < CACHE_MS) {
    return cachedBoundaries;
  }
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  const boundaries =
    settings?.gradeBoundaries?.length ? settings.gradeBoundaries : DEFAULT_GRADE_BOUNDARIES;
  cachedBoundaries = boundaries;
  cacheTime = Date.now();
  return boundaries;
}

export async function gradeForMarks(marks: number, max = 100): Promise<string> {
  const boundaries = await getGradeBoundaries();
  return calculateGradeFromBoundaries(marks, max, boundaries);
}
