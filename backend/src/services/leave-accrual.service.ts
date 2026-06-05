import { AppDataSource } from '../config/data-source';
import { Payslip, PayrollRun, StaffLeaveBalance, StaffPayrollProfile } from '../entities';
import { PayrollRunStatus } from '../entities/enums';

export const DEFAULT_ANNUAL_LEAVE_DAYS = 12;

function num(v: unknown): number {
  return Number(v) || 0;
}

/** Round leave days to 2 decimal places (supports half-days later). */
export function roundLeaveDays(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Monthly accrual: (Annual entitlement) / 12 */
export function monthlyLeaveAccrual(annualEntitlementDays: number): number {
  const annual = annualEntitlementDays > 0 ? annualEntitlementDays : DEFAULT_ANNUAL_LEAVE_DAYS;
  return roundLeaveDays(annual / 12);
}

export function annualLeaveFromProfile(profile?: StaffPayrollProfile | null): number {
  const days = profile?.annualLeaveDays;
  return days != null && num(days) > 0 ? num(days) : DEFAULT_ANNUAL_LEAVE_DAYS;
}

export async function getOrCreateLeaveBalance(staffId: string, annualEntitlement?: number): Promise<StaffLeaveBalance> {
  const repo = AppDataSource.getRepository(StaffLeaveBalance);
  let row = await repo.findOne({ where: { staffId } });
  const annual = annualEntitlement != null && annualEntitlement > 0
    ? annualEntitlement
    : DEFAULT_ANNUAL_LEAVE_DAYS;
  if (!row) {
    row = await repo.save(
      repo.create({
        staffId,
        annualEntitlementDays: annual,
        balanceDays: 0,
      }),
    );
  } else if (annualEntitlement != null && num(row.annualEntitlementDays) !== annual) {
    row.annualEntitlementDays = annual;
    await repo.save(row);
  }
  return row;
}

export interface PayslipLeaveSnapshot {
  annualLeaveEntitlement: number;
  monthlyLeaveAccrual: number;
  leaveOpeningBalance: number;
  leaveTakenDays: number;
  leaveClosingBalance: number;
}

/** Compute leave figures for a new payslip and update staff balance. */
export async function applyMonthlyLeaveAccrual(
  staffId: string,
  profile: StaffPayrollProfile | null,
  leaveTakenDays = 0,
): Promise<PayslipLeaveSnapshot> {
  const annual = annualLeaveFromProfile(profile);
  const accrual = monthlyLeaveAccrual(annual);
  const taken = roundLeaveDays(Math.max(0, leaveTakenDays));

  const balanceRepo = AppDataSource.getRepository(StaffLeaveBalance);
  const balance = await getOrCreateLeaveBalance(staffId, annual);
  const opening = roundLeaveDays(num(balance.balanceDays));
  const closing = roundLeaveDays(opening + accrual - taken);

  balance.balanceDays = closing;
  await balanceRepo.save(balance);

  return {
    annualLeaveEntitlement: annual,
    monthlyLeaveAccrual: accrual,
    leaveOpeningBalance: opening,
    leaveTakenDays: taken,
    leaveClosingBalance: closing,
  };
}

/** Recalculate closing balance when leave taken changes on a draft payslip. */
export async function recalcPayslipLeave(
  payslip: Payslip,
  newLeaveTaken: number,
): Promise<PayslipLeaveSnapshot> {
  const taken = roundLeaveDays(Math.max(0, newLeaveTaken));
  const opening = roundLeaveDays(num(payslip.leaveOpeningBalance));
  const accrual = roundLeaveDays(num(payslip.monthlyLeaveAccrual));
  const oldTaken = roundLeaveDays(num(payslip.leaveTakenDays));
  const closing = roundLeaveDays(opening + accrual - taken);

  const balanceRepo = AppDataSource.getRepository(StaffLeaveBalance);
  const balance = await balanceRepo.findOne({ where: { staffId: payslip.staffId } });
  if (balance) {
    balance.balanceDays = roundLeaveDays(num(balance.balanceDays) + oldTaken - taken);
    await balanceRepo.save(balance);
  }

  payslip.leaveTakenDays = taken;
  payslip.leaveClosingBalance = closing;

  return {
    annualLeaveEntitlement: num(payslip.annualLeaveEntitlement),
    monthlyLeaveAccrual: accrual,
    leaveOpeningBalance: opening,
    leaveTakenDays: taken,
    leaveClosingBalance: closing,
  };
}

/** Undo leave accrual when a draft payroll run is cancelled. */
export async function reverseLeaveAccrualForRun(runId: string): Promise<void> {
  const payslips = await AppDataSource.getRepository(Payslip).find({ where: { payrollRunId: runId } });
  const balanceRepo = AppDataSource.getRepository(StaffLeaveBalance);

  for (const p of payslips) {
    const balance = await balanceRepo.findOne({ where: { staffId: p.staffId } });
    if (!balance) continue;
    const opening = roundLeaveDays(num(p.leaveOpeningBalance));
    balance.balanceDays = opening;
    await balanceRepo.save(balance);
  }
}

export async function listLeaveBalances() {
  const rows = await AppDataSource.getRepository(StaffLeaveBalance)
    .createQueryBuilder('b')
    .innerJoinAndSelect('b.staff', 's')
    .innerJoinAndSelect('s.user', 'u')
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC')
    .getMany();

  return rows.map((b) => ({
    staffId: b.staffId,
    employeeNumber: b.staff.employeeNumber,
    staffName: `${b.staff.user.firstName} ${b.staff.user.lastName}`.trim(),
    department: b.staff.department,
    annualEntitlementDays: num(b.annualEntitlementDays),
    monthlyAccrual: monthlyLeaveAccrual(num(b.annualEntitlementDays)),
    balanceDays: num(b.balanceDays),
  }));
}

export async function getStaffLeaveSummary(staffId: string) {
  const profile = await AppDataSource.getRepository(StaffPayrollProfile).findOne({ where: { staffId } });
  const annual = annualLeaveFromProfile(profile);
  const balance = await getOrCreateLeaveBalance(staffId, annual);
  return {
    staffId,
    annualEntitlementDays: annual,
    monthlyAccrual: monthlyLeaveAccrual(annual),
    balanceDays: num(balance.balanceDays),
    formula: `${annual} ÷ 12 = ${monthlyLeaveAccrual(annual)} day(s) per month`,
  };
}

/** Check if staff already has leave accrued via a non-cancelled run for this period. */
export async function hasLeaveAccrualForPeriod(
  staffId: string,
  year: number,
  month: number,
  excludeRunId?: string,
): Promise<boolean> {
  const qb = AppDataSource.getRepository(Payslip)
    .createQueryBuilder('p')
    .innerJoin('p.payrollRun', 'r')
    .where('p.staffId = :staffId', { staffId })
    .andWhere('r.year = :year', { year })
    .andWhere('r.month = :month', { month })
    .andWhere('r.status != :cancelled', { cancelled: PayrollRunStatus.CANCELLED });
  if (excludeRunId) qb.andWhere('r.id != :excludeRunId', { excludeRunId });
  const count = await qb.getCount();
  return count > 0;
}
