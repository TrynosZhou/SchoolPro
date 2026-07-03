// @ts-nocheck
import { Router, Response } from 'express';
import { In } from 'typeorm';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import {
  generateTimetableFromTeacherLoad,
  getTimetableSnapshot,
} from '../services/timetable-generate.service';
import { loadSchoolBranding } from '../services/school-branding.service';
import { AppDataSource } from '../config/data-source';
import { SchoolClass, Term } from '../entities';
import {
  generateTimetableSummaryPdf,
  generateTimetableClassesGridPdf,
  teacherInitials,
} from '../utils/timetable-summary.pdf';
import {
  buildTimetableTitleLine,
  formatClassTeacherHeader,
  generateAllClassTimetablesPdf,
  generateAllTeacherTimetablesPdf,
  generateClassTimetablePdf,
  generateTeacherTimetablePdf,
} from '../utils/timetable-classic.pdf';
import { formatTeacherTimetableName } from '../utils/teacher-display';
import { shortClassName } from '../utils/teacher-load.pdf';
import { relations } from '../utils/typeorm-helpers';
import { moveTimetableSlot } from '../services/timetable-move.service';
import { setBulkTimetableSlotsLocked, setTimetableSlotLocked } from '../services/timetable-lock.service';
import { loadTimetableContext, saveTimetableVersion } from '../services/timetable-context.service';
import {
  createTeacherAllocation,
  deleteTeacherAllocation,
  getTeacherAvailability,
  getTeacherWeeklySchedule,
  parseDayOfWeekInput,
  updateTeacherAllocation,
} from '../services/teacher-allocation.service';

const router = Router();
router.use(authenticate);

const manageRoles = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const viewRoles = [...manageRoles, UserRole.TEACHER];

function conflictStatus(err: Error & { conflict?: unknown }) {
  if (err.conflict) {
    return { status: 409, body: { message: err.message, conflict: err.conflict } };
  }
  return { status: 400, body: { message: err.message } };
}

function parsePeriodsQuery(raw: unknown): { startTime: string; endTime: string; name?: string }[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolvePeriodsFromQuery(raw: unknown) {
  let periods = parsePeriodsQuery(raw);
  if (periods.length) return periods;

  const snapshot = await getTimetableSnapshot();
  const times = new Map<string, { startTime: string; endTime: string }>();
  for (const teacher of snapshot.teachers) {
    for (const slot of teacher.slots) {
      times.set(`${slot.startTime}|${slot.endTime}`, {
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }
  return [...times.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

async function loadTimetablePdfContext() {
  return loadTimetableContext();
}

router.get('/context', authorize(...viewRoles), async (_req, res: Response) => {
  try {
    const ctx = await loadTimetablePdfContext();
    res.json({
      schoolName: ctx.schoolName,
      titleLine: ctx.titleLine,
      termVersionLabel: ctx.termVersionLabel,
      termName: ctx.termName,
      yearName: ctx.yearName,
      timetableVersion: ctx.timetableVersion,
    });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to load timetable context.' });
  }
});

router.patch('/version', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const version = await saveTimetableVersion(req.body?.version);
    const ctx = await loadTimetableContext();
    res.json({
      timetableVersion: version,
      termVersionLabel: ctx.termVersionLabel,
      titleLine: ctx.titleLine,
    });
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to save timetable version.' });
  }
});

router.post('/generate', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const { periods, replaceExisting, classIds, timetableVersion } = req.body || {};
    if (!Array.isArray(periods) || !periods.length) {
      return res.status(400).json({ message: 'periods array is required (lesson times from Configure Periods).' });
    }
    if (timetableVersion !== undefined && timetableVersion !== null && String(timetableVersion).trim()) {
      await saveTimetableVersion(timetableVersion);
    }
    const result = await generateTimetableFromTeacherLoad({
      periods,
      replaceExisting: replaceExisting !== false,
      classIds: Array.isArray(classIds) ? classIds : undefined,
    });
    res.status(result.success ? 201 : 207).json(result);
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to generate timetable.' });
  }
});

router.get('/generate/snapshot', authorize(...viewRoles), async (_req, res: Response) => {
  try {
    res.json(await getTimetableSnapshot());
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to load timetable snapshot.' });
  }
});

router.get('/generate/summary/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    if (!snapshot.teachers.length) {
      return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
    }

    const branding = await loadSchoolBranding();
    const pdf = await generateTimetableSummaryPdf({
      schoolName: branding.schoolName || 'School Pro Academy',
      tagline: branding.tagline,
      logoUrl: branding.logoUrl,
      generatedAt: new Date(),
      periods,
      teachers: snapshot.teachers.map((t) => ({
        teacherLabel: teacherInitials(t.teacherName),
        teacherName: t.teacherName,
        employeeNumber: t.employeeNumber,
        slots: t.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          className: s.className,
        })),
      })),
    });

    const filename = 'teacher-summary-timetable.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to generate summary timetable PDF.' });
  }
});

router.get('/generate/classes-grid/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    if (!snapshot.classes.length) {
      return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
    }

    const branding = await loadSchoolBranding();
    const pdf = await generateTimetableClassesGridPdf({
      schoolName: branding.schoolName || 'School Pro Academy',
      tagline: branding.tagline,
      logoUrl: branding.logoUrl,
      generatedAt: new Date(),
      periods,
      classes: snapshot.classes.map((c) => ({
        classLabel: shortClassName(c.className),
        className: c.className,
        slots: c.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          subjectName: s.subjectName,
          subjectCode: s.subjectCode,
          subjectShort: s.subjectShort,
        })),
      })),
    });

    const filename = 'class-timetables-grid.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to generate class timetables PDF.' });
  }
});

router.get('/generate/teachers/all/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    if (!snapshot.teachers.length) {
      return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
    }

    const ctx = await loadTimetablePdfContext();
    const pdf = await generateAllTeacherTimetablesPdf(
      snapshot.teachers.map((teacher) => ({
        schoolName: ctx.schoolName,
        logoUrl: ctx.branding.logoUrl,
        titleLine: ctx.titleLine,
        subtitleLine: `Teacher: ${teacher.teacherName}`,
        generatedAt: ctx.generatedAt,
        footerBrand: ctx.schoolName,
        teacherName: teacher.teacherName,
        periods,
        slots: teacher.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          className: s.className,
          subjectName: s.subjectName,
          subjectCode: s.subjectCode,
          subjectShort: s.subjectShort,
        })),
      })),
    );

    const filename = 'all-teacher-timetables.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to generate teacher timetables PDF.' });
  }
});

router.get('/generate/classes/all/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    if (!snapshot.classes.length) {
      return res.status(400).json({ message: 'No timetable data to export. Generate a timetable first.' });
    }

    const ctx = await loadTimetablePdfContext();
    const classIds = snapshot.classes.map((c) => c.classId);
    const schoolClasses = classIds.length
      ? await AppDataSource.getRepository(SchoolClass).find({
          where: { id: In(classIds) },
          relations: relations('classTeacher', 'classTeacher.user'),
        })
      : [];
    const classTeacherById = new Map(
      schoolClasses.map((sc) => {
        const name = sc.classTeacher ? formatTeacherTimetableName(sc.classTeacher) : '';
        return [sc.id, name] as const;
      }),
    );

    const pdf = await generateAllClassTimetablesPdf(
      snapshot.classes.map((cls) => ({
        schoolName: ctx.schoolName,
        logoUrl: ctx.branding.logoUrl,
        titleLine: ctx.titleLine,
        subtitleLine: `Class: ${shortClassName(cls.className)}`,
        headerRight: formatClassTeacherHeader(classTeacherById.get(cls.classId) || '') || undefined,
        generatedAt: ctx.generatedAt,
        footerBrand: ctx.schoolName,
        className: cls.className,
        periods,
        slots: cls.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          subjectName: s.subjectName,
          subjectCode: s.subjectCode,
          subjectShort: s.subjectShort,
          teacherName: s.teacherName,
        })),
      })),
    );

    const filename = 'all-class-timetables.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to generate class timetables PDF.' });
  }
});

router.get('/generate/teacher/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const teacherId = String(req.query.teacherId || '').trim();
    if (!teacherId) {
      return res.status(400).json({ message: 'teacherId is required.' });
    }

    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    const teacher = snapshot.teachers.find((t) => t.teacherId === teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher timetable not found. Generate a timetable first.' });
    }

    const ctx = await loadTimetablePdfContext();
    const pdf = await generateTeacherTimetablePdf({
      schoolName: ctx.schoolName,
      logoUrl: ctx.branding.logoUrl,
      titleLine: ctx.titleLine,
      subtitleLine: `Teacher: ${teacher.teacherName}`,
      generatedAt: ctx.generatedAt,
      footerBrand: ctx.schoolName,
      teacherName: teacher.teacherName,
      periods,
      slots: teacher.slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        className: s.className,
        subjectName: s.subjectName,
        subjectCode: s.subjectCode,
        subjectShort: s.subjectShort,
      })),
    });

    const safeName = teacher.teacherName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'teacher';
    const filename = `timetable-teacher-${safeName}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ message: e.message || 'Failed to generate teacher timetable PDF.' });
  }
});

router.get('/generate/class/pdf', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const preview = String(req.query.preview || '').toLowerCase() === 'true';
    const classId = String(req.query.classId || '').trim();
    if (!classId) {
      return res.status(400).json({ message: 'classId is required.' });
    }

    const periods = await resolvePeriodsFromQuery(req.query.periods);
    if (!periods.length) {
      return res.status(400).json({ message: 'No period times available. Configure periods or pass periods JSON.' });
    }

    const snapshot = await getTimetableSnapshot();
    const cls = snapshot.classes.find((c) => c.classId === classId);
    if (!cls) {
      return res.status(404).json({ message: 'Class timetable not found. Generate a timetable first.' });
    }

    const ctx = await loadTimetablePdfContext();
    const schoolClass = await AppDataSource.getRepository(SchoolClass).findOne({
      where: { id: classId },
      relations: relations('classTeacher', 'classTeacher.user'),
    });
    const classTeacherName = schoolClass?.classTeacher
      ? formatTeacherTimetableName(schoolClass.classTeacher)
      : '';
    const headerRight = formatClassTeacherHeader(classTeacherName);

    const pdf = await generateClassTimetablePdf({
      schoolName: ctx.schoolName,
      logoUrl: ctx.branding.logoUrl,
      titleLine: ctx.titleLine,
      subtitleLine: `Class: ${shortClassName(cls.className)}`,
      headerRight: headerRight || undefined,
      generatedAt: ctx.generatedAt,
      footerBrand: ctx.schoolName,
      className: cls.className,
      periods,
      slots: cls.slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        subjectName: s.subjectName,
        subjectCode: s.subjectCode,
        subjectShort: s.subjectShort,
        teacherName: s.teacherName,
      })),
    });

    const safeName = cls.className.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'class';
    const filename = `timetable-class-${safeName}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    const e = err as Error;
    console.error('Class timetable PDF error:', e);
    res.status(500).json({ message: e.message || 'Failed to generate class timetable PDF.' });
  }
});

router.patch('/slots/:id/move', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const { dayOfWeek, startTime, endTime } = req.body || {};
    const result = await moveTimetableSlot(req.params.id, { dayOfWeek, startTime, endTime });
    res.json(result);
  } catch (err) {
    const e = err as Error & { conflict?: unknown };
    if (e.conflict) {
      return res.status(409).json({ message: e.message, conflict: e.conflict });
    }
    res.status(400).json({ message: e.message || 'Failed to move timetable slot.' });
  }
});

router.patch('/slots/lock-bulk', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const locked = req.body?.locked;
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ message: 'locked (boolean) is required.' });
    }
    const result = await setBulkTimetableSlotsLocked(locked);
    res.json(result);
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to update lesson locks.' });
  }
});

router.patch('/slots/:id/lock', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const locked = req.body?.locked;
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ message: 'locked (boolean) is required.' });
    }
    const result = await setTimetableSlotLocked(req.params.id, locked);
    res.json(result);
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to update lesson lock.' });
  }
});

/** Teacher availability for a day/time slot (grey-out dropdown). */
router.get('/teacher-allocation/availability', authorize(...viewRoles), async (req, res: Response) => {
  try {
    const dayOfWeek = parseDayOfWeekInput(req.query.dayOfWeek);
    const startTime = String(req.query.startTime || '').trim();
    const endTime = String(req.query.endTime || '').trim();
    if (!startTime || !endTime) {
      return res.status(400).json({ message: 'startTime and endTime are required.' });
    }
    const excludeAllocationId = req.query.excludeAllocationId
      ? String(req.query.excludeAllocationId)
      : undefined;
    res.json(await getTeacherAvailability({ dayOfWeek, startTime, endTime, excludeAllocationId }));
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Invalid availability request.' });
  }
});

/** Full weekly schedule for one teacher across all classes. */
router.get('/teacher-allocation/schedule/:teacherId', authorize(...viewRoles), async (req, res: Response) => {
  try {
    res.json(await getTeacherWeeklySchedule(req.params.teacherId));
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to load teacher schedule.' });
  }
});

/** Alias matching spec: GET /teacher-allocation/:teacherId */
router.get('/teacher-allocation/:teacherId', authorize(...viewRoles), async (req, res: Response) => {
  try {
    res.json(await getTeacherWeeklySchedule(req.params.teacherId));
  } catch (err) {
    const e = err as Error;
    res.status(400).json({ message: e.message || 'Failed to load teacher schedule.' });
  }
});

router.post('/teacher-allocation', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const { timetableEntryId, teacherId } = req.body || {};
    if (!timetableEntryId || !teacherId) {
      return res.status(400).json({ message: 'timetableEntryId and teacherId are required.' });
    }
    const row = await createTeacherAllocation({ timetableEntryId, teacherId });
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error & { conflict?: unknown };
    const out = conflictStatus(e);
    res.status(out.status).json(out.body);
  }
});

router.put('/teacher-allocation/:id', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    const row = await updateTeacherAllocation(req.params.id, req.body || {});
    res.json(row);
  } catch (err) {
    const e = err as Error & { conflict?: unknown };
    if (e.message === 'Teacher allocation not found.') {
      return res.status(404).json({ message: e.message });
    }
    const out = conflictStatus(e);
    res.status(out.status).json(out.body);
  }
});

router.delete('/teacher-allocation/:id', authorize(...manageRoles), async (req: AuthRequest, res: Response) => {
  try {
    res.json(await deleteTeacherAllocation(req.params.id));
  } catch (err) {
    const e = err as Error;
    if (e.message === 'Teacher allocation not found.') {
      return res.status(404).json({ message: e.message });
    }
    res.status(400).json({ message: e.message || 'Failed to remove allocation.' });
  }
});

export default router;
