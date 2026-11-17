import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Guardian, Notification, Parent, Student } from '../entities';
import { relations } from '../utils/typeorm-helpers';

/**
 * Minimal in-app parent notification helper for welfare modules
 * (discipline, health, meetings, transport, hostel, gate).
 * Resolves every guardian/parent portal account linked to the given students
 * and writes a Notification row for each.
 */
export async function notifyStudentParents(
  studentIds: string[],
  payload: { title: string; message: string; type: string; metadata?: Record<string, unknown> },
): Promise<number> {
  const unique = [...new Set(studentIds.filter(Boolean))];
  if (!unique.length) return 0;

  const userIds = new Set<string>();

  const students = await AppDataSource.getRepository(Student).find({
    where: { id: In(unique) },
    select: { id: true, userId: true },
  });
  for (const s of students) {
    if (s.userId) userIds.add(s.userId);
  }

  const guardians = await AppDataSource.getRepository(Guardian).find({
    where: { studentId: In(unique) },
    relations: relations('parent', 'parent.user'),
  });
  for (const g of guardians) {
    if (g.parent?.userId) userIds.add(g.parent.userId);
    if (g.parent?.user?.id) userIds.add(g.parent.user.id);
  }

  // Guardians without a portal account may still have a parent row via parentId
  const parentIds = guardians.map((g) => g.parentId).filter(Boolean) as string[];
  if (parentIds.length) {
    const parents = await AppDataSource.getRepository(Parent).find({
      where: { id: In(parentIds) },
      relations: relations('user'),
    });
    for (const p of parents) {
      if (p.userId) userIds.add(p.userId);
      if (p.user?.id) userIds.add(p.user.id);
    }
  }

  if (!userIds.size) return 0;

  const repo = AppDataSource.getRepository(Notification);
  const rows = [...userIds].map((userId) =>
    repo.create({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      metadata: payload.metadata,
    }),
  );
  await repo.save(rows);
  return rows.length;
}

/** Notify a single user account (teacher/staff/parent) directly. */
export async function notifyUser(
  userId: string | undefined | null,
  payload: { title: string; message: string; type: string; metadata?: Record<string, unknown> },
): Promise<void> {
  if (!userId) return;
  const repo = AppDataSource.getRepository(Notification);
  await repo.save(
    repo.create({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      metadata: payload.metadata,
    }),
  );
}
