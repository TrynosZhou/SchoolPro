// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { Student, StudentAttendance, ExamMark, Invoice, Term } from '../entities';
import { InvoiceStatus, AttendanceStatus } from '../entities/enums';
import { studentNames } from '../utils/lookups';
import { today } from '../utils/helpers';
import { In } from 'typeorm';

const router = Router();

router.use(authenticate);

const STAFF: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

const DAY_MS = 86400000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

interface RiskFlag {
  studentId: string;
  studentName?: string;
  severity: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  metrics: {
    markTrend?: { previousAvg: number; currentAvg: number; delta: number };
    absence?: { recentAbsences: number; recentRate: number; priorRate: number };
    arrears?: { outstanding: number; overdueInvoices: number };
  };
}

/** Early-warning scan across all active students. */
router.get('/students', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { classId, minSeverity } = req.query as any;
    const students = await AppDataSource.getRepository(Student).find({
      where: { isActive: true },
      relations: { schoolClass: true },
    });
    const targets = classId ? students.filter((s: any) => s.classId === classId || s.schoolClass?.id === classId) : students;
    if (!targets.length) return res.json([]);

    const ids = targets.map((s) => s.id);
    const [marks, attendance, invoices] = await Promise.all([
      AppDataSource.getRepository(ExamMark).find({ where: { studentId: In(ids) } }),
      AppDataSource.getRepository(StudentAttendance).find({ where: { studentId: In(ids) } }),
      AppDataSource.getRepository(Invoice).find({
        where: { studentId: In(ids) },
        relations: { lines: true },
      }),
    ]);

    const terms = await AppDataSource.getRepository(Term).find({ order: { startDate: 'ASC' } });
    const termOrder = new Map(terms.map((t, i) => [t.id, i]));

    const flags: RiskFlag[] = [];

    for (const s of targets) {
      const reasons: string[] = [];
      let score = 0;
      const metrics: RiskFlag['metrics'] = {};

      // --- Marks trend: compare avg of last two terms that have marks ---
      const studentMarks = marks.filter((m) => m.studentId === s.id);
      const byTerm = new Map<string, number[]>();
      for (const m of studentMarks) {
        const arr = byTerm.get(m.termId) || [];
        arr.push(Number(m.marks));
        byTerm.set(m.termId, arr);
      }
      const termAvgs = [...byTerm.entries()]
        .map(([termId, vals]) => ({ termId, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
        .sort((a, b) => (termOrder.get(a.termId) || 0) - (termOrder.get(b.termId) || 0));
      if (termAvgs.length >= 2) {
        const prev = termAvgs[termAvgs.length - 2];
        const cur = termAvgs[termAvgs.length - 1];
        const delta = cur.avg - prev.avg;
        metrics.markTrend = { previousAvg: round1(prev.avg), currentAvg: round1(cur.avg), delta: round1(delta) };
        if (delta <= -10) {
          score += 3;
          reasons.push(`Marks dropped ${Math.abs(round1(delta))} points vs previous term (${round1(prev.avg)}% → ${round1(cur.avg)}%)`);
        } else if (delta <= -5) {
          score += 2;
          reasons.push(`Marks declined ${Math.abs(round1(delta))} points vs previous term`);
        }
        if (cur.avg < 40) {
          score += 2;
          reasons.push(`Current term average is critically low (${round1(cur.avg)}%)`);
        }
      }

      // --- Attendance: absences in last 30 days vs prior 30 ---
      const cutoffRecent = daysAgo(30);
      const cutoffPrior = daysAgo(60);
      const att = attendance.filter((a) => a.studentId === s.id);
      const recent = att.filter((a) => a.date >= cutoffRecent);
      const prior = att.filter((a) => a.date >= cutoffPrior && a.date < cutoffRecent);
      const recentAbs = recent.filter((a) => a.status === AttendanceStatus.ABSENT).length;
      const priorAbs = prior.filter((a) => a.status === AttendanceStatus.ABSENT).length;
      const recentRate = recent.length ? recentAbs / recent.length : 0;
      const priorRate = prior.length ? priorAbs / prior.length : 0;
      if (recent.length || prior.length) {
        metrics.absence = {
          recentAbsences: recentAbs,
          recentRate: round2(recentRate * 100),
          priorRate: round2(priorRate * 100),
        };
        if (recentAbs >= 5 || recentRate >= 0.2) {
          score += 3;
          reasons.push(`${recentAbs} absences in the last 30 days (${round1(recentRate * 100)}% absence rate)`);
        } else if (recentAbs >= 3 || (recentRate > priorRate * 1.5 && recentAbs >= 2)) {
          score += 2;
          reasons.push(`Rising absence: ${recentAbs} absences recently vs ${priorAbs} in the prior period`);
        }
      }

      // --- Fee arrears ---
      const studentInvoices = invoices.filter(
        (i) => i.studentId === s.id && i.status !== InvoiceStatus.CANCELLED && i.status !== InvoiceStatus.DRAFT,
      );
      const outstanding = studentInvoices.reduce(
        (sum, i) => sum + Math.max(0, Number(i.totalAmount) - Number(i.amountPaid)),
        0,
      );
      const overdueInvoices = studentInvoices.filter(
        (i) => Number(i.totalAmount) - Number(i.amountPaid) > 0 && i.dueDate && i.dueDate < today(),
      ).length;
      if (outstanding > 0) {
        metrics.arrears = { outstanding: round2(outstanding), overdueInvoices };
        if (overdueInvoices >= 2 || outstanding >= 500) {
          score += 3;
          reasons.push(`Fee arrears: $${round2(outstanding)} outstanding across ${overdueInvoices} overdue invoice(s)`);
        } else {
          score += 1;
          reasons.push(`Outstanding fees: $${round2(outstanding)}`);
        }
      }

      if (score > 0) {
        const severity: RiskFlag['severity'] = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
        flags.push({ studentId: s.id, severity, score, reasons, metrics });
      }
    }

    flags.sort((a, b) => b.score - a.score);
    const names = await studentNames(flags.map((f) => f.studentId));
    let out = flags.map((f) => ({ ...f, studentName: names.get(f.studentId) }));
    if (minSeverity === 'high') out = out.filter((f) => f.severity === 'high');
    else if (minSeverity === 'medium') out = out.filter((f) => f.severity !== 'low');

    res.json(out);
  } catch (e) {
    console.error('[early-warning:students]', e);
    res.status(500).json({ message: 'Could not run early-warning scan.' });
  }
});

/** Term-over-term progress for one student (marks avg + attendance rate per term). */
router.get('/progress/:studentId', async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId);
    const terms = await AppDataSource.getRepository(Term).find({ order: { startDate: 'ASC' } });
    const [marks, attendance] = await Promise.all([
      AppDataSource.getRepository(ExamMark).find({ where: { studentId } }),
      AppDataSource.getRepository(StudentAttendance).find({ where: { studentId } }),
    ]);

    const points = terms.map((t) => {
      const tm = marks.filter((m) => m.termId === t.id).map((m) => Number(m.marks));
      const ta = attendance.filter((a) => a.date >= t.startDate && a.date <= t.endDate);
      const present = ta.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
      return {
        termId: t.id,
        termName: t.name,
        average: tm.length ? round1(tm.reduce((a, b) => a + b, 0) / tm.length) : null,
        subjects: tm.length,
        attendanceRate: ta.length ? round1((present / ta.length) * 100) : null,
        daysRecorded: ta.length,
      };
    });

    res.json({ studentId, terms: points });
  } catch (e) {
    console.error('[early-warning:progress]', e);
    res.status(500).json({ message: 'Could not load progress.' });
  }
});

function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }

export default router;
