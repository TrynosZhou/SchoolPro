import { AppDataSource } from '../config/data-source';
import { UserRole } from '../entities/enums';
import type { AuthPayload } from '../middleware/auth';

/** Stable conversation key for a two-user pair (sorted so it is symmetric). */
export function conversationKey(a: string, b: string): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

const OFFICE_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
]);

export interface MessagingRecipient {
  id: string; // User id
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  /** Why this person is reachable, e.g. "Mathematics · Anna" or "School office". */
  context?: string;
}

interface RecipientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

async function officeRecipients(): Promise<MessagingRecipient[]> {
  const rows: RecipientRow[] = await AppDataSource.query(
    `SELECT id, "firstName", "lastName", email, role
       FROM users
      WHERE "isActive" = true AND role IN ('admin','director','principal')
      ORDER BY "firstName", "lastName"`,
  );
  return rows.map((u) => ({ ...u, context: 'School office' }));
}

/** Student ids linked to a parent account (via guardians). */
export async function getParentStudentIds(parentId: string): Promise<string[]> {
  const rows: { studentId: string }[] = await AppDataSource.query(
    `SELECT DISTINCT "studentId" FROM guardians
      WHERE "parentId" = $1 AND "studentId" IS NOT NULL`,
    [parentId],
  );
  return rows.map((r) => r.studentId);
}

/** User ids of every teacher (subject + class teacher) for the given students. */
export async function getTeacherUserIdsForStudents(studentIds: string[]): Promise<Set<string>> {
  if (!studentIds.length) return new Set();
  const rows: { userId: string }[] = await AppDataSource.query(
    `
    SELECT DISTINCT st."userId" AS "userId"
      FROM students s
      JOIN class_subjects cs ON cs."classId" = s."classId"
      JOIN staff st ON st.id = cs."teacherId"
     WHERE s.id = ANY($1) AND cs."teacherId" IS NOT NULL AND st."userId" IS NOT NULL
    UNION
    SELECT DISTINCT st."userId" AS "userId"
      FROM students s
      JOIN classes c ON c.id = s."classId"
      JOIN staff st ON st.id = c."classTeacherId"
     WHERE s.id = ANY($1) AND c."classTeacherId" IS NOT NULL AND st."userId" IS NOT NULL
    `,
    [studentIds],
  );
  return new Set(rows.map((r) => r.userId));
}

/** Student ids taught by a teacher (subject teacher or class teacher). */
async function getStudentIdsTaughtByStaff(staffId: string): Promise<string[]> {
  const rows: { id: string }[] = await AppDataSource.query(
    `
    SELECT DISTINCT s.id
      FROM students s
     WHERE s."isActive" = true AND s."classId" IN (
       SELECT cs."classId" FROM class_subjects cs WHERE cs."teacherId" = $1
       UNION
       SELECT c.id FROM classes c WHERE c."classTeacherId" = $1
     )
    `,
    [staffId],
  );
  return rows.map((r) => r.id);
}

/**
 * Recipients a PARENT may message: the school office plus only the teachers
 * actually assigned to their child(ren) — never the whole staff list.
 */
export async function listParentMessagingRecipients(parentId: string): Promise<MessagingRecipient[]> {
  const studentIds = await getParentStudentIds(parentId);
  const recipients = new Map<string, MessagingRecipient>();
  for (const r of await officeRecipients()) recipients.set(r.id, r);

  if (studentIds.length) {
    const notes = new Map<string, Set<string>>();

    const subjectTeachers: (RecipientRow & { subjectName: string | null; studentFirst: string })[] =
      await AppDataSource.query(
        `
        SELECT st."userId" AS id, u."firstName", u."lastName", u.email, u.role,
               subj.name AS "subjectName", s."firstName" AS "studentFirst"
          FROM students s
          JOIN class_subjects cs ON cs."classId" = s."classId"
          JOIN staff st ON st.id = cs."teacherId"
          JOIN users u ON u.id = st."userId"
          LEFT JOIN subjects subj ON subj.id = cs."subjectId"
         WHERE s.id = ANY($1) AND cs."teacherId" IS NOT NULL AND u."isActive" = true
        `,
        [studentIds],
      );

    const classTeachers: (RecipientRow & { studentFirst: string })[] = await AppDataSource.query(
      `
      SELECT st."userId" AS id, u."firstName", u."lastName", u.email, u.role,
             s."firstName" AS "studentFirst"
        FROM students s
        JOIN classes c ON c.id = s."classId"
        JOIN staff st ON st.id = c."classTeacherId"
        JOIN users u ON u.id = st."userId"
       WHERE s.id = ANY($1) AND c."classTeacherId" IS NOT NULL AND u."isActive" = true
      `,
      [studentIds],
    );

    const addNote = (id: string, note: string) => {
      const set = notes.get(id) ?? new Set<string>();
      set.add(note);
      notes.set(id, set);
    };

    for (const t of subjectTeachers) {
      if (!recipients.has(t.id)) {
        recipients.set(t.id, {
          id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email, role: t.role,
        });
      }
      addNote(t.id, `${t.subjectName || 'Subject'} · ${t.studentFirst}`);
    }
    for (const t of classTeachers) {
      if (!recipients.has(t.id)) {
        recipients.set(t.id, {
          id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email, role: t.role,
        });
      }
      addNote(t.id, `Class teacher · ${t.studentFirst}`);
    }
    for (const [id, set] of notes) {
      const r = recipients.get(id);
      if (r) r.context = [...set].join(', ');
    }
  }

  return [...recipients.values()];
}

/**
 * Recipients a STUDENT may message: the school office plus their own teachers.
 */
export async function listStudentMessagingRecipients(studentId: string): Promise<MessagingRecipient[]> {
  const recipients = new Map<string, MessagingRecipient>();
  for (const r of await officeRecipients()) recipients.set(r.id, r);

  const notes = new Map<string, Set<string>>();
  const teachers: (RecipientRow & { subjectName: string | null; kind: string })[] =
    await AppDataSource.query(
      `
      SELECT st."userId" AS id, u."firstName", u."lastName", u.email, u.role,
             subj.name AS "subjectName", 'subject' AS kind
        FROM students s
        JOIN class_subjects cs ON cs."classId" = s."classId"
        JOIN staff st ON st.id = cs."teacherId"
        JOIN users u ON u.id = st."userId"
        LEFT JOIN subjects subj ON subj.id = cs."subjectId"
       WHERE s.id = $1 AND cs."teacherId" IS NOT NULL AND u."isActive" = true
      UNION
      SELECT st."userId" AS id, u."firstName", u."lastName", u.email, u.role,
             NULL AS "subjectName", 'class' AS kind
        FROM students s
        JOIN classes c ON c.id = s."classId"
        JOIN staff st ON st.id = c."classTeacherId"
        JOIN users u ON u.id = st."userId"
       WHERE s.id = $1 AND c."classTeacherId" IS NOT NULL AND u."isActive" = true
      `,
      [studentId],
    );
  for (const t of teachers) {
    if (!recipients.has(t.id)) {
      recipients.set(t.id, {
        id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email, role: t.role,
      });
    }
    const set = notes.get(t.id) ?? new Set<string>();
    set.add(t.kind === 'class' ? 'Class teacher' : t.subjectName || 'Subject teacher');
    notes.set(t.id, set);
  }
  for (const [id, set] of notes) {
    const r = recipients.get(id);
    if (r) r.context = [...set].join(', ');
  }

  return [...recipients.values()];
}

/**
 * Recipients a TEACHER may message: the school office plus parents/students of
 * the students they teach.
 */
export async function listTeacherMessagingRecipients(staffId: string): Promise<MessagingRecipient[]> {
  const recipients = new Map<string, MessagingRecipient>();
  for (const r of await officeRecipients()) recipients.set(r.id, r);

  const studentIds = await getStudentIdsTaughtByStaff(staffId);
  if (studentIds.length) {
    const parents: (RecipientRow & { studentFirst: string; studentLast: string })[] =
      await AppDataSource.query(
        `
        SELECT u.id, u."firstName", u."lastName", u.email, u.role,
               s."firstName" AS "studentFirst", s."lastName" AS "studentLast"
          FROM students s
          JOIN guardians g ON g."studentId" = s.id
          JOIN parents p ON p.id = g."parentId"
          JOIN users u ON u.id = p."userId"
         WHERE s.id = ANY($1) AND u."isActive" = true
        `,
        [studentIds],
      );
    for (const p of parents) {
      if (!recipients.has(p.id)) {
        recipients.set(p.id, {
          id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, role: p.role,
          context: `Parent of ${p.studentFirst} ${p.studentLast}`.trim(),
        });
      }
    }

    const students: RecipientRow[] = await AppDataSource.query(
      `
      SELECT u.id, u."firstName", u."lastName", u.email, u.role
        FROM students s
        JOIN users u ON u.id = s."userId"
       WHERE s.id = ANY($1) AND s."userId" IS NOT NULL AND u."isActive" = true
      `,
      [studentIds],
    );
    for (const s of students) {
      if (!recipients.has(s.id)) {
        recipients.set(s.id, {
          id: s.id, firstName: s.firstName, lastName: s.lastName, email: s.email, role: s.role,
          context: 'Student',
        });
      }
    }
  }

  return [...recipients.values()];
}

async function canParentMessageUser(
  parentId: string,
  recipientUserId: string,
  recipientRole: UserRole,
): Promise<boolean> {
  if (OFFICE_ROLES.has(recipientRole)) return true;
  if (recipientRole === UserRole.TEACHER) {
    const studentIds = await getParentStudentIds(parentId);
    if (!studentIds.length) return false;
    const teacherUserIds = await getTeacherUserIdsForStudents(studentIds);
    return teacherUserIds.has(recipientUserId);
  }
  return false;
}

async function canStudentMessageUser(
  studentId: string,
  recipientUserId: string,
  recipientRole: UserRole,
): Promise<boolean> {
  if (OFFICE_ROLES.has(recipientRole)) return true;
  if (recipientRole === UserRole.TEACHER) {
    const teacherUserIds = await getTeacherUserIdsForStudents([studentId]);
    return teacherUserIds.has(recipientUserId);
  }
  return false;
}

async function canTeacherMessageUser(
  staffId: string,
  recipientUserId: string,
  recipientRole: UserRole,
): Promise<boolean> {
  // Staff can always reach the office and colleagues.
  if (OFFICE_ROLES.has(recipientRole) || recipientRole === UserRole.TEACHER) return true;
  if (recipientRole === UserRole.PARENT || recipientRole === UserRole.STUDENT) {
    const reachable = await listTeacherMessagingRecipients(staffId);
    return reachable.some((r) => r.id === recipientUserId);
  }
  return false;
}

/**
 * Central messaging permission gate. Office roles are unrestricted; parents and
 * students may only reach their own teachers (plus the office); teachers may
 * only reach parents/students of the students they teach (plus office/staff).
 */
export async function canMessageRecipient(
  sender: AuthPayload,
  recipient: { id: string; role: UserRole },
): Promise<boolean> {
  if (sender.userId === recipient.id) return false;
  const role = sender.role;
  if (OFFICE_ROLES.has(role)) return true;
  if (role === UserRole.TEACHER) {
    if (!sender.staffId) return false;
    return canTeacherMessageUser(sender.staffId, recipient.id, recipient.role);
  }
  if (role === UserRole.PARENT) {
    if (!sender.parentId) return false;
    return canParentMessageUser(sender.parentId, recipient.id, recipient.role);
  }
  if (role === UserRole.STUDENT) {
    if (!sender.studentId) return false;
    return canStudentMessageUser(sender.studentId, recipient.id, recipient.role);
  }
  return false;
}
