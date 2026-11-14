import { AppDataSource } from '../config/data-source';
import { LeaveRequest, LeaveRequestStatus, LeaveType } from '../entities/LeaveRequest';
import { Notification, Staff } from '../entities';
import { relations } from '../utils/typeorm-helpers';
import { normalizeDateOnly } from '../utils/date-only';
import { logAudit } from './audit-log.service';

export const LEAVE_TYPES: LeaveType[] = [
  'annual',
  'sick',
  'maternity',
  'paternity',
  'compassionate',
  'study',
  'unpaid',
];

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  maternity: 'Maternity leave',
  paternity: 'Paternity leave',
  compassionate: 'Compassionate leave',
  study: 'Study leave',
  unpaid: 'Unpaid leave',
};

const MAX_SPAN_DAYS = 366;

/** Error that routes translate into a 4xx response. */
export class LeaveRequestError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'LeaveRequestError';
  }
}

interface Actor {
  userId: string;
  role: string;
  email?: string;
}

/** Working days (Mon–Fri) between two YYYY-MM-DD dates, inclusive. */
export function countWorkingDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let n = 0;
  while (d <= last) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function staffName(s: Staff): string {
  return `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim() || s.employeeNumber;
}

/** Shape sent to the client — never expose the full user row (password hash etc.). */
function toDto(r: LeaveRequest) {
  const s = r.staff;
  return {
    id: r.id,
    staffId: r.staffId,
    staff: s
      ? {
          id: s.id,
          employeeNumber: s.employeeNumber,
          title: s.title ?? null,
          department: s.department,
          isActive: s.isActive,
          user: {
            firstName: s.user?.firstName ?? '',
            lastName: s.user?.lastName ?? '',
            role: s.user?.role ?? '',
          },
        }
      : undefined,
    leaveType: r.leaveType,
    startDate: String(r.startDate).slice(0, 10),
    endDate: String(r.endDate).slice(0, 10),
    days: Number(r.days),
    reason: r.reason ?? undefined,
    status: r.status,
    reviewNote: r.reviewNote ?? undefined,
    reviewedAt: r.reviewedAt ?? undefined,
    createdAt: r.createdAt,
  };
}

async function loadOne(id: string): Promise<LeaveRequest> {
  const row = await AppDataSource.getRepository(LeaveRequest).findOne({
    where: { id },
    relations: relations('staff', 'staff.user'),
  });
  if (!row) throw new LeaveRequestError('Leave request not found', 404);
  return row;
}

export async function listLeaveRequests(status?: string) {
  const where: Record<string, unknown> = {};
  if (status && status !== 'all') where.status = status;
  const rows = await AppDataSource.getRepository(LeaveRequest).find({
    where: where as never,
    relations: relations('staff', 'staff.user'),
    order: { startDate: 'DESC', createdAt: 'DESC' },
  });
  return rows.map(toDto);
}

async function notifyStaff(r: LeaveRequest, title: string, message: string) {
  try {
    const userId = r.staff?.userId;
    if (!userId) return;
    const repo = AppDataSource.getRepository(Notification);
    await repo.save(
      repo.create({
        userId,
        title,
        message,
        type: 'leave_request',
        metadata: { leaveRequestId: r.id, status: r.status },
      }),
    );
  } catch (err) {
    console.error('[leave-requests] notification failed:', err);
  }
}

export interface CreateLeaveInput {
  staffId?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  status?: string;
}

export async function createLeaveRequest(input: CreateLeaveInput, actor: Actor) {
  const staffId = String(input.staffId || '').trim();
  if (!staffId) throw new LeaveRequestError('Select a staff member.');

  const leaveType = String(input.leaveType || '') as LeaveType;
  if (!LEAVE_TYPES.includes(leaveType)) throw new LeaveRequestError('Choose a valid leave type.');

  const startDate = normalizeDateOnly(input.startDate);
  const endDate = normalizeDateOnly(input.endDate);
  if (!startDate || !endDate) throw new LeaveRequestError('Choose the first and last day of leave.');
  if (endDate < startDate) throw new LeaveRequestError('The last day cannot be before the first day.');

  const spanDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  if (spanDays > MAX_SPAN_DAYS) throw new LeaveRequestError('A leave request cannot cover more than a year.');

  const days = countWorkingDays(startDate, endDate);
  if (days < 1) throw new LeaveRequestError('The selected dates contain no working days.');

  const staff = await AppDataSource.getRepository(Staff).findOne({
    where: { id: staffId },
    relations: relations('user'),
  });
  if (!staff || !staff.isActive) throw new LeaveRequestError('Staff member not found or inactive.', 404);

  const repo = AppDataSource.getRepository(LeaveRequest);

  // Overlap with an existing pending/approved request for the same person.
  const clash = await repo
    .createQueryBuilder('r')
    .where('r.staffId = :staffId', { staffId })
    .andWhere('r.status IN (:...open)', { open: ['pending', 'approved'] })
    .andWhere('r.startDate <= :endDate AND r.endDate >= :startDate', { startDate, endDate })
    .getOne();
  if (clash) {
    throw new LeaveRequestError(
      `${staffName(staff)} already has ${clash.status} leave from ${String(clash.startDate).slice(0, 10)} to ${String(clash.endDate).slice(0, 10)}.`,
      409,
    );
  }

  const approveNow = input.status === 'approved';
  const row = await repo.save(
    repo.create({
      staffId,
      leaveType,
      startDate,
      endDate,
      days,
      reason: input.reason?.trim() || null,
      status: approveNow ? 'approved' : 'pending',
      requestedById: actor.userId,
      reviewedById: approveNow ? actor.userId : null,
      reviewedAt: approveNow ? new Date() : null,
    }),
  );

  await logAudit({
    userId: actor.userId,
    userRole: actor.role,
    userEmail: actor.email,
    action: 'create',
    module: 'leave_requests',
    recordId: row.id,
    recordLabel: `${staffName(staff)} · ${LEAVE_LABELS[leaveType]} · ${startDate} to ${endDate}`,
  });

  const full = await loadOne(row.id);
  if (approveNow) {
    await notifyStaff(
      full,
      'Leave approved',
      `Your ${LEAVE_LABELS[leaveType].toLowerCase()} from ${startDate} to ${endDate} (${days} working days) has been approved.`,
    );
  }
  return toDto(full);
}

export async function reviewLeaveRequest(
  id: string,
  decision: string,
  note: string | undefined,
  actor: Actor,
) {
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new LeaveRequestError('Decision must be approved or rejected.');
  }
  const trimmed = note?.trim();
  if (decision === 'rejected' && !trimmed) {
    throw new LeaveRequestError('Add a short reason so the staff member knows why.');
  }

  const row = await loadOne(id);
  if (row.status !== 'pending') {
    throw new LeaveRequestError(`This request has already been ${row.status}.`, 409);
  }

  if (decision === 'approved') {
    // Re-check overlap against other approved leave (a pending request may have been
    // created before another one was approved).
    const clash = await AppDataSource.getRepository(LeaveRequest)
      .createQueryBuilder('r')
      .where('r.staffId = :staffId', { staffId: row.staffId })
      .andWhere('r.id <> :id', { id })
      .andWhere('r.status = :s', { s: 'approved' })
      .andWhere('r.startDate <= :endDate AND r.endDate >= :startDate', {
        startDate: row.startDate,
        endDate: row.endDate,
      })
      .getOne();
    if (clash) {
      throw new LeaveRequestError('This overlaps leave that has already been approved for the same person.', 409);
    }
  }

  const prev = row.status;
  row.status = decision as LeaveRequestStatus;
  row.reviewNote = trimmed || null;
  row.reviewedById = actor.userId;
  row.reviewedAt = new Date();
  await AppDataSource.getRepository(LeaveRequest).save(row);

  await logAudit({
    userId: actor.userId,
    userRole: actor.role,
    userEmail: actor.email,
    action: 'update',
    module: 'leave_requests',
    recordId: row.id,
    recordLabel: `${staffName(row.staff)} · ${LEAVE_LABELS[row.leaveType]}`,
    changes: [{ field: 'status', before: prev, after: row.status }],
  });

  await notifyStaff(
    row,
    decision === 'approved' ? 'Leave approved' : 'Leave request rejected',
    decision === 'approved'
      ? `Your ${LEAVE_LABELS[row.leaveType].toLowerCase()} from ${String(row.startDate).slice(0, 10)} to ${String(row.endDate).slice(0, 10)} has been approved.${trimmed ? ` Note: ${trimmed}` : ''}`
      : `Your ${LEAVE_LABELS[row.leaveType].toLowerCase()} request was not approved. Reason: ${trimmed}`,
  );

  return toDto(row);
}

export async function cancelLeaveRequest(id: string, actor: Actor) {
  const row = await loadOne(id);
  if (row.status !== 'pending' && row.status !== 'approved') {
    throw new LeaveRequestError(`A ${row.status} request cannot be cancelled.`, 409);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (String(row.endDate).slice(0, 10) < today) {
    throw new LeaveRequestError('Leave that has already ended cannot be cancelled.', 409);
  }

  const prev = row.status;
  row.status = 'cancelled';
  row.reviewedById = actor.userId;
  row.reviewedAt = new Date();
  await AppDataSource.getRepository(LeaveRequest).save(row);

  await logAudit({
    userId: actor.userId,
    userRole: actor.role,
    userEmail: actor.email,
    action: 'update',
    module: 'leave_requests',
    recordId: row.id,
    recordLabel: `${staffName(row.staff)} · ${LEAVE_LABELS[row.leaveType]}`,
    changes: [{ field: 'status', before: prev, after: 'cancelled' }],
  });

  await notifyStaff(
    row,
    'Leave cancelled',
    `Your ${LEAVE_LABELS[row.leaveType].toLowerCase()} from ${String(row.startDate).slice(0, 10)} to ${String(row.endDate).slice(0, 10)} was cancelled.`,
  );

  return toDto(row);
}

/**
 * Approved ANNUAL leave working days that fall inside a payroll month.
 * Payroll uses this as "leave taken" so the staff leave balance is reduced
 * once, when the payslip is created (other leave types do not use the balance).
 */
export async function approvedAnnualLeaveDaysInMonth(
  staffId: string,
  year: number,
  month: number,
): Promise<number> {
  const mm = String(month).padStart(2, '0');
  const monthStart = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const rows = await AppDataSource.getRepository(LeaveRequest)
    .createQueryBuilder('r')
    .where('r.staffId = :staffId', { staffId })
    .andWhere('r.status = :status', { status: 'approved' })
    .andWhere('r.leaveType = :type', { type: 'annual' })
    .andWhere('r.startDate <= :monthEnd AND r.endDate >= :monthStart', { monthStart, monthEnd })
    .getMany();

  let total = 0;
  for (const r of rows) {
    const from = String(r.startDate).slice(0, 10) > monthStart ? String(r.startDate).slice(0, 10) : monthStart;
    const to = String(r.endDate).slice(0, 10) < monthEnd ? String(r.endDate).slice(0, 10) : monthEnd;
    total += countWorkingDays(from, to);
  }
  return total;
}
