// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import {
  AttendanceMode,
  LibraryResourceType,
  LmsAssignmentStatus,
  UserRole,
} from '../entities/enums';
import { validateDto, DtoValidationError } from '../utils/validate-dto';
import {
  CreateClassRecordingDto,
  CreateLessonContentDto,
  CreateLibraryResourceDto,
  CreateLmsAssignmentDto,
  CreateLmsSubmissionDto,
  CreateVirtualClassDto,
  GradeLmsSubmissionDto,
  UpdateLessonContentDto,
  UpdateLibraryResourceDto,
  UpdateLmsAssignmentDto,
  UpdateVirtualClassDto,
} from '../dtos/lms.dto';
import { lmsUpload } from '../utils/lms-upload';
import {
  addRecording,
  bookmarkResource,
  createAssignment,
  createLessonContent,
  createLibraryResource,
  createVirtualClass,
  deleteAssignment,
  deleteLessonContent,
  deleteLibraryResource,
  deleteVirtualClass,
  getAssignment,
  getMySubmission,
  gradeSubmission,
  listAssignments,
  listBookmarks,
  listLessonContent,
  listLibraryResources,
  listRecordings,
  listSubmissions,
  listVirtualClasses,
  LmsHttpError,
  removeBookmark,
  submitAssignment,
  updateAssignment,
  updateLessonContent,
  updateLibraryResource,
  updateVirtualClass,
} from '../services/lms.service';
import { AppDataSource } from '../config/data-source';
import { StudentAttendance } from '../entities';
import { AttendanceStatus } from '../entities/enums';
import { today, isSchoolDay } from '../utils/helpers';
import { In } from 'typeorm';
import { Student } from '../entities';
import { assertTeacherClassAccess, assertTeacherClassTeacherAccess } from '../utils/teacher-class-access';

const router = Router();
router.use(authenticate);

const staffRoles = authorize(
  UserRole.ADMIN,
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
  UserRole.TEACHER,
);
const manageRoles = authorize(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER);
const studentRoles = authorize(UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN, UserRole.TEACHER);

function handleError(res: Response, err: unknown) {
  if (err instanceof DtoValidationError) {
    return res.status(400).json({ message: err.message, details: err.details });
  }
  if (err instanceof LmsHttpError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large' });
  }
  console.error(err);
  return res.status(500).json({ message: (err as Error).message || 'Request failed' });
}

function parseBodyJson(body: Record<string, unknown>): Record<string, unknown> {
  // multipart fields arrive as strings; coerce booleans/numbers where needed
  const out: Record<string, unknown> = { ...body };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v !== 'string') continue;
    if (v === 'true') out[key] = true;
    else if (v === 'false') out[key] = false;
    else if (v === 'null') out[key] = null;
    else if (/^\d+(\.\d+)?$/.test(v) && ['maxScore', 'sortOrder', 'grade', 'durationSeconds'].includes(key)) {
      out[key] = Number(v);
    } else if (key === 'accessRoles') {
      try {
        out[key] = JSON.parse(v);
      } catch {
        out[key] = v.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
  }
  return out;
}

// ── Assignments ─────────────────────────────────────────────────────────────

router.get('/assignments', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    const studentId =
      req.user!.role === UserRole.STUDENT
        ? req.user!.studentId
        : (req.query.studentId as string | undefined);
    res.json(
      await listAssignments({
        classId: req.query.classId as string | undefined,
        subjectId: req.query.subjectId as string | undefined,
        termId: req.query.termId as string | undefined,
        status: req.query.status as LmsAssignmentStatus | undefined,
        studentId: req.user!.role === UserRole.STUDENT ? studentId : undefined,
      }),
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/assignments/:id', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAssignment(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

router.post(
  '/assignments',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(CreateLmsAssignmentDto, parseBodyJson(req.body));
      res.status(201).json(await createAssignment(dto, req.user!.staffId, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.put(
  '/assignments/:id',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(UpdateLmsAssignmentDto, parseBodyJson(req.body));
      res.json(await updateAssignment(String(req.params.id), dto, req.user!.staffId, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.delete('/assignments/:id', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await deleteAssignment(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

// ── Submissions ─────────────────────────────────────────────────────────────

router.get('/assignments/:id/submissions', staffRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listSubmissions(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/assignments/:id/my-submission', authorize(UserRole.STUDENT), async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getMySubmission(String(req.params.id), req.user!.studentId));
  } catch (err) {
    handleError(res, err);
  }
});

router.post(
  '/assignments/:id/submissions',
  authorize(UserRole.STUDENT),
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(CreateLmsSubmissionDto, parseBodyJson(req.body));
      res.status(201).json(
        await submitAssignment(String(req.params.id), dto, req.user!.studentId, req.file),
      );
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.post(
  '/submissions/:id/grade',
  staffRoles,
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(GradeLmsSubmissionDto, req.body);
      res.json(await gradeSubmission(String(req.params.id), dto, req.user!.staffId));
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Lesson content ──────────────────────────────────────────────────────────

router.get('/lessons', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    const publishedOnly = req.user!.role === UserRole.STUDENT || req.user!.role === UserRole.PARENT;
    res.json(
      await listLessonContent({
        classId: req.query.classId as string | undefined,
        subjectId: req.query.subjectId as string | undefined,
        termId: req.query.termId as string | undefined,
        publishedOnly,
      }),
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.post(
  '/lessons',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(CreateLessonContentDto, parseBodyJson(req.body));
      res.status(201).json(await createLessonContent(dto, req.user!.staffId, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.put(
  '/lessons/:id',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(UpdateLessonContentDto, parseBodyJson(req.body));
      res.json(await updateLessonContent(String(req.params.id), dto, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.delete('/lessons/:id', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await deleteLessonContent(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

// ── Virtual classes ─────────────────────────────────────────────────────────

router.get('/virtual-classes', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(
      await listVirtualClasses({
        classId: req.query.classId as string | undefined,
        teacherId: req.query.teacherId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      }),
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/virtual-classes', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    const dto = await validateDto(CreateVirtualClassDto, req.body);
    res.status(201).json(await createVirtualClass(dto, req.user!.staffId));
  } catch (err) {
    handleError(res, err);
  }
});

router.put('/virtual-classes/:id', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    const dto = await validateDto(UpdateVirtualClassDto, req.body);
    res.json(await updateVirtualClass(String(req.params.id), dto));
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/virtual-classes/:id', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await deleteVirtualClass(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

router.post(
  '/virtual-classes/:id/recordings',
  manageRoles,
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(CreateClassRecordingDto, req.body);
      res.status(201).json(await addRecording(String(req.params.id), dto));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.get('/classes/:classId/recordings', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listRecordings(String(req.params.classId)));
  } catch (err) {
    handleError(res, err);
  }
});

// ── Library ─────────────────────────────────────────────────────────────────

router.get('/library', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    const publishedOnly = ![UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL, UserRole.TEACHER].includes(
      req.user!.role,
    );
    res.json(
      await listLibraryResources(
        {
          q: req.query.q as string | undefined,
          subjectId: req.query.subjectId as string | undefined,
          gradeFormId: req.query.gradeFormId as string | undefined,
          resourceType: req.query.resourceType as LibraryResourceType | undefined,
          publishedOnly,
        },
        req.user!.role,
      ),
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/library/bookmarks', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listBookmarks(req.user!.userId));
  } catch (err) {
    handleError(res, err);
  }
});

router.post(
  '/library',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(CreateLibraryResourceDto, parseBodyJson(req.body));
      res.status(201).json(await createLibraryResource(dto, req.user!.userId, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.put(
  '/library/:id',
  manageRoles,
  lmsUpload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dto = await validateDto(UpdateLibraryResourceDto, parseBodyJson(req.body));
      res.json(await updateLibraryResource(String(req.params.id), dto, req.file));
    } catch (err) {
      handleError(res, err);
    }
  },
);

router.delete('/library/:id', manageRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await deleteLibraryResource(String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/library/:id/bookmark', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.status(201).json(await bookmarkResource(req.user!.userId, String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/library/:id/bookmark', studentRoles, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await removeBookmark(req.user!.userId, String(req.params.id)));
  } catch (err) {
    handleError(res, err);
  }
});

// ── Hybrid attendance (mode-aware bulk) ─────────────────────────────────────

router.post(
  '/attendance/hybrid-bulk',
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(StudentAttendance);
      const studentRepo = AppDataSource.getRepository(Student);
      const { date = today(), records } = req.body;

      if (!isSchoolDay(date)) {
        return res.status(400).json({
          message:
            'Attendance registers cannot be marked on weekends. Registers are marked Monday to Friday only.',
        });
      }
      if (!Array.isArray(records) || !records.length) {
        return res.status(400).json({ message: 'records array is required' });
      }

      const studentIds = [...new Set(records.map((r: { studentId: string }) => r.studentId))];
      const students = await studentRepo.find({
        where: { id: In(studentIds) },
        select: { id: true, classId: true },
      });
      if (students.length !== studentIds.length) {
        return res.status(400).json({ message: 'One or more students were not found' });
      }
      const classIds = [...new Set(students.map((s) => s.classId).filter(Boolean))];
      if (classIds.length !== 1) {
        return res.status(400).json({ message: 'All students must belong to the same class' });
      }

      if (req.user!.role === UserRole.TEACHER) {
        if (!(await assertTeacherClassTeacherAccess(req, classIds[0]!))) {
          return res.status(403).json({ message: 'Only the class teacher can mark attendance for this class' });
        }
      } else if (!(await assertTeacherClassAccess(req, classIds[0]!))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      const saved = [];
      for (const r of records) {
        let existing = await repo.findOne({ where: { studentId: r.studentId, date } });
        const mode = Object.values(AttendanceMode).includes(r.mode) ? r.mode : AttendanceMode.IN_PERSON;
        if (existing) {
          existing.status = r.status;
          existing.mode = mode;
          existing.remarks = r.remarks;
          existing.markedById = req.user!.staffId;
          saved.push(await repo.save(existing));
        } else {
          saved.push(
            await repo.save(
              repo.create({
                studentId: r.studentId,
                date,
                status: r.status,
                mode,
                remarks: r.remarks,
                markedById: req.user!.staffId,
              }),
            ),
          );
        }
      }
      res.json(saved);
    } catch (err) {
      handleError(res, err);
    }
  },
);

export default router;
