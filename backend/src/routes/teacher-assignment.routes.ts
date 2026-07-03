import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { validateDto } from '../utils/validate-dto';
import {
  BulkTeacherAssignmentDto,
  CreateTeacherAssignmentDto,
  CreateTimetableSlotDto,
  UpdateTeacherAssignmentDto,
  UpdateTimetableSlotDto,
} from '../dtos/teacher-assignment.dto';
import {
  bulkCreateTeacherAssignments,
  createTeacherAssignment,
  createTimetableSlot,
  deleteTimetableSlot,
  endTeacherAssignment,
  getClassRoster,
  getTeacherWeeklySchedule,
  getWorkloadSummaryReport,
  listSections,
  listTeacherAssignments,
  resetTeacherAssignments,
  resetAllTeacherAssignments,
  syncSubjectAssignmentsFromClassSubjects,
  TeacherAssignmentConflictError,
  updateTeacherAssignment,
  updateTimetableSlot,
} from '../services/teacher-assignment.service';
import { DtoValidationError } from '../utils/validate-dto';

const router = Router();
const canView = authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL);
const canManage = authorize(UserRole.ADMIN, UserRole.PRINCIPAL);

router.use(authenticate);

function handleError(res: Response, err: unknown) {
  if (err instanceof DtoValidationError) {
    return res.status(400).json({ message: err.message, details: err.details });
  }
  if (err instanceof TeacherAssignmentConflictError) {
    return res.status(409).json({ message: err.message });
  }
  const status = (err as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ message: (err as Error).message });
  }
  console.error(err);
  return res.status(500).json({ message: (err as Error).message || 'Request failed' });
}

router.get('/sections', canView, async (req, res) => {
  try {
    const formId = req.query.formId ? String(req.query.formId) : undefined;
    res.json(await listSections(formId));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/', canView, async (req, res) => {
  try {
    const activeOnly = req.query.includeInactive !== 'true';
    res.json(
      await listTeacherAssignments({
        teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
        classId: req.query.classId ? String(req.query.classId) : undefined,
        sectionId: req.query.sectionId ? String(req.query.sectionId) : undefined,
        activeOnly,
      }),
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/', canManage, async (req: AuthRequest, res) => {
  try {
    const dto = await validateDto(CreateTeacherAssignmentDto, req.body);
    res.status(201).json(await createTeacherAssignment(dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/bulk', canManage, async (req: AuthRequest, res) => {
  try {
    const dto = await validateDto(BulkTeacherAssignmentDto, req.body);
    res.status(201).json(await bulkCreateTeacherAssignments(dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/sync-teacher-load', canManage, async (_req, res) => {
  try {
    const synced = await syncSubjectAssignmentsFromClassSubjects();
    res.json({ synced });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/reset-all', canManage, async (req, res) => {
  try {
    const confirmText = String(req.body?.confirmText ?? '').trim();
    if (confirmText !== 'RESET') {
      return res.status(400).json({ message: 'Type RESET to confirm this action' });
    }
    res.json(await resetAllTeacherAssignments());
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/teacher/:teacherId/reset', canManage, async (req, res) => {
  try {
    const confirmText = String(req.body?.confirmText ?? '').trim();
    if (confirmText !== 'RESET') {
      return res.status(400).json({ message: 'Type RESET to confirm this action' });
    }
    res.json(await resetTeacherAssignments(String(req.params.teacherId)));
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/:id', canManage, async (req, res) => {
  try {
    const dto = await validateDto(UpdateTeacherAssignmentDto, req.body);
    res.json(await updateTeacherAssignment(String(req.params.id), dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/end', canManage, async (req, res) => {
  try {
    const endDate = req.body?.endDate ? String(req.body.endDate) : undefined;
    res.json(await endTeacherAssignment(String(req.params.id), endDate));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/workload/summary', canView, async (_req, res) => {
  try {
    res.json(await getWorkloadSummaryReport());
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/class-roster/:classId', canView, async (req, res) => {
  try {
    const sectionId = req.query.sectionId ? String(req.query.sectionId) : undefined;
    res.json(await getClassRoster(String(req.params.classId), sectionId));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/teacher-schedule/:teacherId', canView, async (req, res) => {
  try {
    res.json(await getTeacherWeeklySchedule(String(req.params.teacherId)));
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/timetable-slots', canManage, async (req, res) => {
  try {
    const dto = await validateDto(CreateTimetableSlotDto, req.body);
    res.status(201).json(await createTimetableSlot(dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.patch('/timetable-slots/:id', canManage, async (req, res) => {
  try {
    const dto = await validateDto(UpdateTimetableSlotDto, req.body);
    res.json(await updateTimetableSlot(String(req.params.id), dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/timetable-slots/:id', canManage, async (req, res) => {
  try {
    await deleteTimetableSlot(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
