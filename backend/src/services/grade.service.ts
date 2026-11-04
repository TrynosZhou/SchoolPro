import { AppDataSource } from '../config/data-source';
import { SchoolSettings } from '../entities';
import { tenantContext } from '../config/tenant-context';
import {
  DEFAULT_GRADE_BOUNDARIES,
  GradeBoundary,
  calculateGradeFromBoundaries,
} from '../types/grade-boundaries';

const SETTINGS_ID = 'default';

/** Keyed by tenant so demo and production never share a cached copy. */
const cache = new Map<string, { boundaries: GradeBoundary[]; time: number }>();
const CACHE_MS = 30_000;

function cacheKey(): string {
  return tenantContext.isDemo() ? 'demo' : 'prod';
}

export function invalidateGradeBoundariesCache() {
  cache.clear();
}

export async function getGradeBoundaries(): Promise<GradeBoundary[]> {
  const key = cacheKey();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return cached.boundaries;
  }
  const repo = AppDataSource.getRepository(SchoolSettings);
  const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
  const boundaries =
    settings?.gradeBoundaries?.length ? settings.gradeBoundaries : DEFAULT_GRADE_BOUNDARIES;
  cache.set(key, { boundaries, time: Date.now() });
  return boundaries;
}

export async function gradeForMarks(marks: number, max = 100): Promise<string> {
  const boundaries = await getGradeBoundaries();
  return calculateGradeFromBoundaries(marks, max, boundaries);
}
