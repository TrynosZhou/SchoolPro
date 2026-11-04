import { AppDataSource } from '../config/data-source';
import { postPayrollPaymentToGl } from './gl-posting.service';
import { PayrollRun, Payslip, Staff, StaffLeaveBalance, StaffPayrollProfile } from '../entities';
import { PayrollRunStatus, PayslipStatus } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';
import {
  annualLeaveFromProfile,
  applyMonthlyLeaveAccrual,
  getOrCreateLeaveBalance,
  getStaffLeaveSummary,
  hasLeaveAccrualForPeriod,
  monthlyLeaveAccrual,
  recalcPayslipLeave,
  reverseLeaveAccrualForRun,
  roundLeaveDays,
} from './leave-accrual.service';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function num(v: unknown): number {
  return Number(v) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function periodBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    periodLabel: `${MONTH_NAMES[month - 1]} ${year}`,
    periodStart: start.toISOString().split('T')[0],
    periodEnd: end.toISOString().split('T')[0],
    reference: `PAY-${year}-${String(month).padStart(2, '0')}`,
  };
}

export function calcFromProfile(profile: StaffPayrollProfile) {
  const baseSalary = num(profile.baseSalary);
  const housingAllowance = num(profile.housingAllowance);
  const transportAllowance = num(profile.transportAllowance);
  const medicalAllowance = num(profile.medicalAllowance);
  const otherAllowances = num(profile.otherAllowances);
  const grossPay = round2(
    baseSalary + housingAllowance + transportAllowance + medicalAllowance + otherAllowances,
  );
  const payeAmount = num(profile.payeAmount);
  const nssaAmount = num(profile.nssaAmount);
  const pensionAmount = num(profile.pensionAmount);
  const loanDeduction = num(profile.loanDeduction);
  const otherDeductions = num(profile.otherDeductions);
  const totalDeductions = round2(payeAmount + nssaAmount + pensionAmount + loanDeduction + otherDeductions);
  const netPay = round2(grossPay - totalDeductions);
  return {
    baseSalary,
    housingAllowance,
    transportAllowance,
    medicalAllowance,
    otherAllowances,
    grossPay,
    payeAmount,
    nssaAmount,
    pensionAmount,
    loanDeduction,
    otherDeductions,
    totalDeductions,
    netPay,
    paymentMethod: profile.paymentMethod,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    jobTitle: profile.jobTitle,
  };
}

export async function getPayrollSummary() {
  const staffRepo = AppDataSource.getRepository(Staff);
  const profileRepo = AppDataSource.getRepository(StaffPayrollProfile);
  const runRepo = AppDataSource.getRepository(PayrollRun);

  const activeStaff = await staffRepo.count({ where: { isActive: true } });
  const configured = await profileRepo.count({ where: { isActive: true } });
  const runs = await runRepo.find({ order: { year: 'DESC', month: 'DESC' }, take: 6 });
  const draftRuns = await runRepo.count({ where: { status: PayrollRunStatus.DRAFT } });
  const lastPaid = await runRepo.findOne({
    where: { status: PayrollRunStatus.PAID },
    order: { paidAt: 'DESC' },
  });

  const ytdPaid = await runRepo
    .createQueryBuilder('r')
    .select('COALESCE(SUM(r.totalNet), 0)', 'total')
    .where('r.status = :paid', { paid: PayrollRunStatus.PAID })
    .andWhere('r.year = :year', { year: new Date().getFullYear() })
    .getRawOne<{ total: string }>();

  return {
    activeStaff,
    configuredProfiles: configured,
    unconfiguredStaff: Math.max(0, activeStaff - configured),
    draftRuns,
    ytdNetPaid: num(ytdPaid?.total),
    recentRuns: runs,
    lastPaidRun: lastPaid,
  };
}

export async function listProfilesWithStaff() {
  const staffList = await AppDataSource.getRepository(Staff)
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.user', 'u')
    .where('s.isActive = :active', { active: true })
    .orderBy('u.lastName', 'ASC')
    .addOrderBy('u.firstName', 'ASC')
    .getMany();

  const profiles = await AppDataSource.getRepository(StaffPayrollProfile).find();
  const byStaff = new Map(profiles.map((p) => [p.staffId, p]));

  const leaveBalances = await AppDataSource.getRepository(StaffLeaveBalance).find();
  const leaveByStaff = new Map(leaveBalances.map((b) => [b.staffId, b]));

  return staffList.map((s) => {
    const profile = byStaff.get(s.id) ?? null;
    const leave = leaveByStaff.get(s.id);
    const annual = annualLeaveFromProfile(profile);
    return {
      staff: s,
      profile,
      leave: {
        annualEntitlementDays: annual,
        monthlyAccrual: monthlyLeaveAccrual(annual),
        balanceDays: leave ? Number(leave.balanceDays) : 0,
      },
    };
  });
}

export async function upsertProfile(staffId: string, body: Record<string, unknown>) {
  const staff = await AppDataSource.getRepository(Staff).findOne({
    where: { id: staffId },
    relations: relations('user'),
  });
  if (!staff) throw new Error('Staff member not found');

  const repo = AppDataSource.getRepository(StaffPayrollProfile);
  let profile = await repo.findOne({ where: { staffId } });
  const data = {
    staffId,
    jobTitle: body.jobTitle as string | undefined,
    payFrequency: body.payFrequency as StaffPayrollProfile['payFrequency'],
    baseSalary: num(body.baseSalary),
    housingAllowance: num(body.housingAllowance),
    transportAllowance: num(body.transportAllowance),
    medicalAllowance: num(body.medicalAllowance),
    otherAllowances: num(body.otherAllowances),
    payeAmount: num(body.payeAmount),
    nssaAmount: num(body.nssaAmount),
    pensionAmount: num(body.pensionAmount),
    loanDeduction: num(body.loanDeduction),
    otherDeductions: num(body.otherDeductions),
    bankName: body.bankName as string | undefined,
    bankAccount: body.bankAccount as string | undefined,
    bankBranch: body.bankBranch as string | undefined,
    taxReference: body.taxReference as string | undefined,
    nssaNumber: body.nssaNumber as string | undefined,
    paymentMethod: body.paymentMethod as StaffPayrollProfile['paymentMethod'],
    notes: body.notes as string | undefined,
    isActive: body.isActive !== false,
  };

  if (body.annualLeaveDays !== undefined) {
    (data as StaffPayrollProfile).annualLeaveDays = roundLeaveDays(num(body.annualLeaveDays));
  }

  if (profile) {
    Object.assign(profile, data);
  } else {
    profile = repo.create({
      ...data,
      annualLeaveDays: body.annualLeaveDays !== undefined ? roundLeaveDays(num(body.annualLeaveDays)) : 12,
    });
  }
  await repo.save(profile);
  await getOrCreateLeaveBalance(staffId, annualLeaveFromProfile(profile));
  return repo.findOne({ where: { id: profile.id }, relations: relations('staff', 'staff.user') });
}

export async function previewRun(year: number, month: number) {
  const { periodLabel, periodStart, periodEnd, reference } = periodBounds(year, month);
  const existing = await AppDataSource.getRepository(PayrollRun).findOne({ where: { year, month } });

  const rows = await listProfilesWithStaff();
  const included: Array<{
    staffId: string;
    employeeNumber: string;
    name: string;
    department?: string;
    grossPay: number;
    netPay: number;
    annualLeaveEntitlement: number;
    monthlyLeaveAccrual: number;
    leaveBalanceDays: number;
    leaveAlreadyAccruedThisMonth: boolean;
  }> = [];
  const missing: Array<{ staffId: string; employeeNumber: string; name: string }> = [];

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const row of rows) {
    const name = `${row.staff.user.firstName} ${row.staff.user.lastName}`.trim();
    if (!row.profile || !row.profile.isActive || num(row.profile.baseSalary) <= 0) {
      missing.push({
        staffId: row.staff.id,
        employeeNumber: row.staff.employeeNumber,
        name,
      });
      continue;
    }
    const calc = calcFromProfile(row.profile);
    const annual = annualLeaveFromProfile(row.profile);
    const accrual = monthlyLeaveAccrual(annual);
    const alreadyAccrued = await hasLeaveAccrualForPeriod(row.staff.id, year, month);
    included.push({
      staffId: row.staff.id,
      employeeNumber: row.staff.employeeNumber,
      name,
      department: row.staff.department,
      grossPay: calc.grossPay,
      netPay: calc.netPay,
      annualLeaveEntitlement: annual,
      monthlyLeaveAccrual: accrual,
      leaveBalanceDays: row.leave?.balanceDays ?? 0,
      leaveAlreadyAccruedThisMonth: alreadyAccrued,
    });
    totalGross += calc.grossPay;
    totalDeductions += calc.totalDeductions;
    totalNet += calc.netPay;
  }

  return {
    year,
    month,
    periodLabel,
    periodStart,
    periodEnd,
    reference,
    existingRun: existing,
    staffCount: included.length,
    missingCount: missing.length,
    totalGross: round2(totalGross),
    totalDeductions: round2(totalDeductions),
    totalNet: round2(totalNet),
    included,
    missing,
  };
}

function recalcRunTotals(runId: string) {
  return AppDataSource.getRepository(Payslip)
    .createQueryBuilder('p')
    .select('COUNT(*)', 'cnt')
    .addSelect('COALESCE(SUM(p.grossPay), 0)', 'gross')
    .addSelect('COALESCE(SUM(p.totalDeductions), 0)', 'deductions')
    .addSelect('COALESCE(SUM(p.netPay), 0)', 'net')
    .where('p.payrollRunId = :runId', { runId })
    .andWhere('p.status != :excluded', { excluded: PayslipStatus.EXCLUDED })
    .getRawOne<{ cnt: string; gross: string; deductions: string; net: string }>();
}

export async function createRun(
  year: number,
  month: number,
  opts: { payDate?: string; notes?: string; createdByUserId?: string },
) {
  if (month < 1 || month > 12) throw new Error('Invalid month');
  const runRepo = AppDataSource.getRepository(PayrollRun);
  const existing = await runRepo.findOne({ where: { year, month } });
  if (existing && existing.status !== PayrollRunStatus.CANCELLED) {
    throw new Error(`Payroll run already exists for ${periodBounds(year, month).periodLabel}`);
  }

  const preview = await previewRun(year, month);
  if (preview.staffCount === 0) {
    throw new Error('No staff with active pay profiles. Configure salaries first.');
  }

  const { periodLabel, periodStart, periodEnd, reference } = periodBounds(year, month);
  const payslipRepo = AppDataSource.getRepository(Payslip);
  let run: PayrollRun;

  if (existing?.status === PayrollRunStatus.CANCELLED) {
    await payslipRepo.delete({ payrollRunId: existing.id });
    Object.assign(existing, {
      reference,
      periodLabel,
      periodStart,
      periodEnd,
      payDate: opts.payDate || periodEnd,
      status: PayrollRunStatus.DRAFT,
      staffCount: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      notes: opts.notes,
      createdByUserId: opts.createdByUserId,
      processedAt: undefined,
      processedByUserId: undefined,
      paidAt: undefined,
      paidByUserId: undefined,
    });
    run = await runRepo.save(existing);
  } else {
    run = await runRepo.save(
      runRepo.create({
        reference,
        year,
        month,
        periodLabel,
        periodStart,
        periodEnd,
        payDate: opts.payDate || periodEnd,
        status: PayrollRunStatus.DRAFT,
        staffCount: 0,
        totalGross: 0,
        totalDeductions: 0,
        totalNet: 0,
        notes: opts.notes,
        createdByUserId: opts.createdByUserId,
      }),
    );
  }

  const profileRepo = AppDataSource.getRepository(StaffPayrollProfile);
  const staffRepo = AppDataSource.getRepository(Staff);

  for (const item of preview.included) {
    const staff = await staffRepo.findOne({
      where: { id: item.staffId },
      relations: relations('user'),
    });
    const profile = await profileRepo.findOne({ where: { staffId: item.staffId } });
    if (!staff || !profile) continue;
    const calc = calcFromProfile(profile);
    const staffName = `${staff.user.firstName} ${staff.user.lastName}`.trim();
    const leave = await applyMonthlyLeaveAccrual(staff.id, profile, 0);
    await payslipRepo.save(
      payslipRepo.create({
        payrollRunId: run.id,
        staffId: staff.id,
        employeeNumber: staff.employeeNumber,
        staffName,
        department: staff.department,
        ...calc,
        ...leave,
        status: PayslipStatus.PENDING,
      }),
    );
  }

  const totals = await recalcRunTotals(run.id);
  run.staffCount = Number(totals?.cnt || 0);
  run.totalGross = num(totals?.gross);
  run.totalDeductions = num(totals?.deductions);
  run.totalNet = num(totals?.net);
  await runRepo.save(run);

  return getRunWithPayslips(run.id);
}

export async function getRunWithPayslips(runId: string) {
  const run = await AppDataSource.getRepository(PayrollRun).findOne({ where: { id: runId } });
  if (!run) return null;
  const payslips = await AppDataSource.getRepository(Payslip).find({
    where: { payrollRunId: runId },
    order: { staffName: 'ASC' },
  });
  return { run, payslips };
}

export async function processRun(runId: string, userId?: string) {
  const runRepo = AppDataSource.getRepository(PayrollRun);
  const run = await runRepo.findOne({ where: { id: runId } });
  if (!run) throw new Error('Payroll run not found');
  if (run.status !== PayrollRunStatus.DRAFT) {
    throw new Error('Only draft payroll runs can be processed');
  }
  run.status = PayrollRunStatus.PROCESSED;
  run.processedAt = new Date();
  run.processedByUserId = userId;
  await runRepo.save(run);
  return getRunWithPayslips(runId);
}

export async function markRunPaid(runId: string, userId?: string) {
  const runRepo = AppDataSource.getRepository(PayrollRun);
  const payslipRepo = AppDataSource.getRepository(Payslip);
  const run = await runRepo.findOne({ where: { id: runId } });
  if (!run) throw new Error('Payroll run not found');
  if (run.status !== PayrollRunStatus.PROCESSED) {
    throw new Error('Payroll run must be processed before marking as paid');
  }
  run.status = PayrollRunStatus.PAID;
  run.paidAt = new Date();
  run.paidByUserId = userId;
  await runRepo.save(run);
  await payslipRepo.update(
    { payrollRunId: runId, status: PayslipStatus.PENDING },
    { status: PayslipStatus.PAID },
  );
  await postPayrollPaymentToGl(run, userId || '');
  return getRunWithPayslips(runId);
}

export async function cancelRun(runId: string) {
  const runRepo = AppDataSource.getRepository(PayrollRun);
  const run = await runRepo.findOne({ where: { id: runId } });
  if (!run) throw new Error('Payroll run not found');
  if (run.status !== PayrollRunStatus.DRAFT) {
    throw new Error('Only draft payroll runs can be cancelled');
  }
  await reverseLeaveAccrualForRun(runId);
  run.status = PayrollRunStatus.CANCELLED;
  await runRepo.save(run);
  return run;
}

export async function updatePayslip(payslipId: string, body: Record<string, unknown>) {
  const repo = AppDataSource.getRepository(Payslip);
  const payslip = await repo.findOne({ where: { id: payslipId }, relations: relations('payrollRun') });
  if (!payslip) throw new Error('Payslip not found');
  if (payslip.payrollRun.status !== PayrollRunStatus.DRAFT) {
    throw new Error('Payslips can only be edited on draft payroll runs');
  }

  if (body.status === PayslipStatus.EXCLUDED) {
    payslip.status = PayslipStatus.EXCLUDED;
    payslip.notes = (body.notes as string) || payslip.notes;
    await repo.save(payslip);
  } else if (body.status === PayslipStatus.PENDING) {
    payslip.status = PayslipStatus.PENDING;
    await repo.save(payslip);
  } else {
    if (body.baseSalary !== undefined) payslip.baseSalary = num(body.baseSalary);
    if (body.housingAllowance !== undefined) payslip.housingAllowance = num(body.housingAllowance);
    if (body.transportAllowance !== undefined) payslip.transportAllowance = num(body.transportAllowance);
    if (body.medicalAllowance !== undefined) payslip.medicalAllowance = num(body.medicalAllowance);
    if (body.otherAllowances !== undefined) payslip.otherAllowances = num(body.otherAllowances);
    if (body.payeAmount !== undefined) payslip.payeAmount = num(body.payeAmount);
    if (body.nssaAmount !== undefined) payslip.nssaAmount = num(body.nssaAmount);
    if (body.pensionAmount !== undefined) payslip.pensionAmount = num(body.pensionAmount);
    if (body.loanDeduction !== undefined) payslip.loanDeduction = num(body.loanDeduction);
    if (body.otherDeductions !== undefined) payslip.otherDeductions = num(body.otherDeductions);
    if (body.notes !== undefined) payslip.notes = String(body.notes);
    if (body.leaveTakenDays !== undefined) {
      await recalcPayslipLeave(payslip, num(body.leaveTakenDays));
    }
    const grossPay = round2(
      num(payslip.baseSalary) + num(payslip.housingAllowance) + num(payslip.transportAllowance)
        + num(payslip.medicalAllowance) + num(payslip.otherAllowances),
    );
    const totalDeductions = round2(
      num(payslip.payeAmount) + num(payslip.nssaAmount) + num(payslip.pensionAmount)
        + num(payslip.loanDeduction) + num(payslip.otherDeductions),
    );
    payslip.grossPay = grossPay;
    payslip.totalDeductions = totalDeductions;
    payslip.netPay = round2(grossPay - totalDeductions);
    await repo.save(payslip);
  }

  const totals = await recalcRunTotals(payslip.payrollRunId);
  const run = await AppDataSource.getRepository(PayrollRun).findOne({ where: { id: payslip.payrollRunId } });
  if (run) {
    run.staffCount = Number(totals?.cnt || 0);
    run.totalGross = num(totals?.gross);
    run.totalDeductions = num(totals?.deductions);
    run.totalNet = num(totals?.net);
    await AppDataSource.getRepository(PayrollRun).save(run);
  }

  return repo.findOne({ where: { id: payslipId } });
}

export { getStaffLeaveSummary, listLeaveBalances } from './leave-accrual.service';
