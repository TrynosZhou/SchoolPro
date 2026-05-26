import type { ObjectLiteral, Repository } from 'typeorm';

/** TypeORM 1.x rejects findOne({ order }) without where — use find + take 1 instead. */
export async function findLatest<T extends ObjectLiteral>(
  repo: Repository<T>,
  order: Record<string, 'ASC' | 'DESC'> = { createdAt: 'DESC' }
): Promise<T | null> {
  const rows = await repo.find({ order: order as never, take: 1 });
  return rows[0] ?? null;
}

/** Build TypeORM 1.x object-style relations from dot paths, e.g. 'student.schoolClass.form' */
export function relations(...paths: string[]): Record<string, unknown> {  const result: Record<string, unknown> = {};
  for (const path of paths) {
    const parts = path.split('.');
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (i === parts.length - 1) {
        current[key] = true;
      } else {
        if (!current[key] || current[key] === true) {
          current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
      }
    }
  }
  return result;
}

export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/** Common relation sets */
export const USER_PROFILES = relations('staffProfile', 'parentProfile', 'studentProfile');
