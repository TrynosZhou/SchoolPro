"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLeaveBalances = exports.getStaffLeaveSummary = void 0;
exports.periodBounds = periodBounds;
exports.calcFromProfile = calcFromProfile;
exports.getPayrollSummary = getPayrollSummary;
exports.listProfilesWithStaff = listProfilesWithStaff;
exports.upsertProfile = upsertProfile;
exports.previewRun = previewRun;
exports.createRun = createRun;
exports.getRunWithPayslips = getRunWithPayslips;
exports.processRun = processRun;
exports.markRunPaid = markRunPaid;
exports.cancelRun = cancelRun;
exports.updatePayslip = updatePayslip;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const leave_accrual_service_1 = require("./leave-accrual.service");
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
function num(v) {
    return Number(v) || 0;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function periodBounds(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
        periodLabel: `${MONTH_NAMES[month - 1]} ${year}`,
        periodStart: start.toISOString().split('T')[0],
        periodEnd: end.toISOString().split('T')[0],
        reference: `PAY-${year}-${String(month).padStart(2, '0')}`,
    };
}
function calcFromProfile(profile) {
    const baseSalary = num(profile.baseSalary);
    const housingAllowance = num(profile.housingAllowance);
    const transportAllowance = num(profile.transportAllowance);
    const medicalAllowance = num(profile.medicalAllowance);
    const otherAllowances = num(profile.otherAllowances);
    const grossPay = round2(baseSalary + housingAllowance + transportAllowance + medicalAllowance + otherAllowances);
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
async function getPayrollSummary() {
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    const profileRepo = data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile);
    const runRepo = data_source_1.AppDataSource.getRepository(entities_1.PayrollRun);
    const activeStaff = await staffRepo.count({ where: { isActive: true } });
    const configured = await profileRepo.count({ where: { isActive: true } });
    const runs = await runRepo.find({ order: { year: 'DESC', month: 'DESC' }, take: 6 });
    const draftRuns = await runRepo.count({ where: { status: enums_1.PayrollRunStatus.DRAFT } });
    const lastPaid = await runRepo.findOne({
        where: { status: enums_1.PayrollRunStatus.PAID },
        order: { paidAt: 'DESC' },
    });
    const ytdPaid = await runRepo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.totalNet), 0)', 'total')
        .where('r.status = :paid', { paid: enums_1.PayrollRunStatus.PAID })
        .andWhere('r.year = :year', { year: new Date().getFullYear() })
        .getRawOne();
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
async function listProfilesWithStaff() {
    const staffList = await data_source_1.AppDataSource.getRepository(entities_1.Staff)
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.user', 'u')
        .where('s.isActive = :active', { active: true })
        .orderBy('u.lastName', 'ASC')
        .addOrderBy('u.firstName', 'ASC')
        .getMany();
    const profiles = await data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile).find();
    const byStaff = new Map(profiles.map((p) => [p.staffId, p]));
    const leaveBalances = await data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance).find();
    const leaveByStaff = new Map(leaveBalances.map((b) => [b.staffId, b]));
    return staffList.map((s) => {
        const profile = byStaff.get(s.id) ?? null;
        const leave = leaveByStaff.get(s.id);
        const annual = (0, leave_accrual_service_1.annualLeaveFromProfile)(profile);
        return {
            staff: s,
            profile,
            leave: {
                annualEntitlementDays: annual,
                monthlyAccrual: (0, leave_accrual_service_1.monthlyLeaveAccrual)(annual),
                balanceDays: leave ? Number(leave.balanceDays) : 0,
            },
        };
    });
}
async function upsertProfile(staffId, body) {
    const staff = await data_source_1.AppDataSource.getRepository(entities_1.Staff).findOne({
        where: { id: staffId },
        relations: (0, typeorm_helpers_1.relations)('user'),
    });
    if (!staff)
        throw new Error('Staff member not found');
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile);
    let profile = await repo.findOne({ where: { staffId } });
    const data = {
        staffId,
        jobTitle: body.jobTitle,
        payFrequency: body.payFrequency,
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
        bankName: body.bankName,
        bankAccount: body.bankAccount,
        bankBranch: body.bankBranch,
        taxReference: body.taxReference,
        nssaNumber: body.nssaNumber,
        paymentMethod: body.paymentMethod,
        notes: body.notes,
        isActive: body.isActive !== false,
    };
    if (body.annualLeaveDays !== undefined) {
        data.annualLeaveDays = (0, leave_accrual_service_1.roundLeaveDays)(num(body.annualLeaveDays));
    }
    if (profile) {
        Object.assign(profile, data);
    }
    else {
        profile = repo.create({
            ...data,
            annualLeaveDays: body.annualLeaveDays !== undefined ? (0, leave_accrual_service_1.roundLeaveDays)(num(body.annualLeaveDays)) : 12,
        });
    }
    await repo.save(profile);
    await (0, leave_accrual_service_1.getOrCreateLeaveBalance)(staffId, (0, leave_accrual_service_1.annualLeaveFromProfile)(profile));
    return repo.findOne({ where: { id: profile.id }, relations: (0, typeorm_helpers_1.relations)('staff', 'staff.user') });
}
async function previewRun(year, month) {
    const { periodLabel, periodStart, periodEnd, reference } = periodBounds(year, month);
    const existing = await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).findOne({ where: { year, month } });
    const rows = await listProfilesWithStaff();
    const included = [];
    const missing = [];
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
        const annual = (0, leave_accrual_service_1.annualLeaveFromProfile)(row.profile);
        const accrual = (0, leave_accrual_service_1.monthlyLeaveAccrual)(annual);
        const alreadyAccrued = await (0, leave_accrual_service_1.hasLeaveAccrualForPeriod)(row.staff.id, year, month);
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
function recalcRunTotals(runId) {
    return data_source_1.AppDataSource.getRepository(entities_1.Payslip)
        .createQueryBuilder('p')
        .select('COUNT(*)', 'cnt')
        .addSelect('COALESCE(SUM(p.grossPay), 0)', 'gross')
        .addSelect('COALESCE(SUM(p.totalDeductions), 0)', 'deductions')
        .addSelect('COALESCE(SUM(p.netPay), 0)', 'net')
        .where('p.payrollRunId = :runId', { runId })
        .andWhere('p.status != :excluded', { excluded: enums_1.PayslipStatus.EXCLUDED })
        .getRawOne();
}
async function createRun(year, month, opts) {
    if (month < 1 || month > 12)
        throw new Error('Invalid month');
    const runRepo = data_source_1.AppDataSource.getRepository(entities_1.PayrollRun);
    const existing = await runRepo.findOne({ where: { year, month } });
    if (existing && existing.status !== enums_1.PayrollRunStatus.CANCELLED) {
        throw new Error(`Payroll run already exists for ${periodBounds(year, month).periodLabel}`);
    }
    const preview = await previewRun(year, month);
    if (preview.staffCount === 0) {
        throw new Error('No staff with active pay profiles. Configure salaries first.');
    }
    const { periodLabel, periodStart, periodEnd, reference } = periodBounds(year, month);
    const payslipRepo = data_source_1.AppDataSource.getRepository(entities_1.Payslip);
    let run;
    if (existing?.status === enums_1.PayrollRunStatus.CANCELLED) {
        await payslipRepo.delete({ payrollRunId: existing.id });
        Object.assign(existing, {
            reference,
            periodLabel,
            periodStart,
            periodEnd,
            payDate: opts.payDate || periodEnd,
            status: enums_1.PayrollRunStatus.DRAFT,
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
    }
    else {
        run = await runRepo.save(runRepo.create({
            reference,
            year,
            month,
            periodLabel,
            periodStart,
            periodEnd,
            payDate: opts.payDate || periodEnd,
            status: enums_1.PayrollRunStatus.DRAFT,
            staffCount: 0,
            totalGross: 0,
            totalDeductions: 0,
            totalNet: 0,
            notes: opts.notes,
            createdByUserId: opts.createdByUserId,
        }));
    }
    const profileRepo = data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile);
    const staffRepo = data_source_1.AppDataSource.getRepository(entities_1.Staff);
    for (const item of preview.included) {
        const staff = await staffRepo.findOne({
            where: { id: item.staffId },
            relations: (0, typeorm_helpers_1.relations)('user'),
        });
        const profile = await profileRepo.findOne({ where: { staffId: item.staffId } });
        if (!staff || !profile)
            continue;
        const calc = calcFromProfile(profile);
        const staffName = `${staff.user.firstName} ${staff.user.lastName}`.trim();
        const leave = await (0, leave_accrual_service_1.applyMonthlyLeaveAccrual)(staff.id, profile, 0);
        await payslipRepo.save(payslipRepo.create({
            payrollRunId: run.id,
            staffId: staff.id,
            employeeNumber: staff.employeeNumber,
            staffName,
            department: staff.department,
            ...calc,
            ...leave,
            status: enums_1.PayslipStatus.PENDING,
        }));
    }
    const totals = await recalcRunTotals(run.id);
    run.staffCount = Number(totals?.cnt || 0);
    run.totalGross = num(totals?.gross);
    run.totalDeductions = num(totals?.deductions);
    run.totalNet = num(totals?.net);
    await runRepo.save(run);
    return getRunWithPayslips(run.id);
}
async function getRunWithPayslips(runId) {
    const run = await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).findOne({ where: { id: runId } });
    if (!run)
        return null;
    const payslips = await data_source_1.AppDataSource.getRepository(entities_1.Payslip).find({
        where: { payrollRunId: runId },
        order: { staffName: 'ASC' },
    });
    return { run, payslips };
}
async function processRun(runId, userId) {
    const runRepo = data_source_1.AppDataSource.getRepository(entities_1.PayrollRun);
    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run)
        throw new Error('Payroll run not found');
    if (run.status !== enums_1.PayrollRunStatus.DRAFT) {
        throw new Error('Only draft payroll runs can be processed');
    }
    run.status = enums_1.PayrollRunStatus.PROCESSED;
    run.processedAt = new Date();
    run.processedByUserId = userId;
    await runRepo.save(run);
    return getRunWithPayslips(runId);
}
async function markRunPaid(runId, userId) {
    const runRepo = data_source_1.AppDataSource.getRepository(entities_1.PayrollRun);
    const payslipRepo = data_source_1.AppDataSource.getRepository(entities_1.Payslip);
    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run)
        throw new Error('Payroll run not found');
    if (run.status !== enums_1.PayrollRunStatus.PROCESSED) {
        throw new Error('Payroll run must be processed before marking as paid');
    }
    run.status = enums_1.PayrollRunStatus.PAID;
    run.paidAt = new Date();
    run.paidByUserId = userId;
    await runRepo.save(run);
    await payslipRepo.update({ payrollRunId: runId, status: enums_1.PayslipStatus.PENDING }, { status: enums_1.PayslipStatus.PAID });
    return getRunWithPayslips(runId);
}
async function cancelRun(runId) {
    const runRepo = data_source_1.AppDataSource.getRepository(entities_1.PayrollRun);
    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run)
        throw new Error('Payroll run not found');
    if (run.status !== enums_1.PayrollRunStatus.DRAFT) {
        throw new Error('Only draft payroll runs can be cancelled');
    }
    await (0, leave_accrual_service_1.reverseLeaveAccrualForRun)(runId);
    run.status = enums_1.PayrollRunStatus.CANCELLED;
    await runRepo.save(run);
    return run;
}
async function updatePayslip(payslipId, body) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Payslip);
    const payslip = await repo.findOne({ where: { id: payslipId }, relations: (0, typeorm_helpers_1.relations)('payrollRun') });
    if (!payslip)
        throw new Error('Payslip not found');
    if (payslip.payrollRun.status !== enums_1.PayrollRunStatus.DRAFT) {
        throw new Error('Payslips can only be edited on draft payroll runs');
    }
    if (body.status === enums_1.PayslipStatus.EXCLUDED) {
        payslip.status = enums_1.PayslipStatus.EXCLUDED;
        payslip.notes = body.notes || payslip.notes;
        await repo.save(payslip);
    }
    else if (body.status === enums_1.PayslipStatus.PENDING) {
        payslip.status = enums_1.PayslipStatus.PENDING;
        await repo.save(payslip);
    }
    else {
        if (body.baseSalary !== undefined)
            payslip.baseSalary = num(body.baseSalary);
        if (body.housingAllowance !== undefined)
            payslip.housingAllowance = num(body.housingAllowance);
        if (body.transportAllowance !== undefined)
            payslip.transportAllowance = num(body.transportAllowance);
        if (body.medicalAllowance !== undefined)
            payslip.medicalAllowance = num(body.medicalAllowance);
        if (body.otherAllowances !== undefined)
            payslip.otherAllowances = num(body.otherAllowances);
        if (body.payeAmount !== undefined)
            payslip.payeAmount = num(body.payeAmount);
        if (body.nssaAmount !== undefined)
            payslip.nssaAmount = num(body.nssaAmount);
        if (body.pensionAmount !== undefined)
            payslip.pensionAmount = num(body.pensionAmount);
        if (body.loanDeduction !== undefined)
            payslip.loanDeduction = num(body.loanDeduction);
        if (body.otherDeductions !== undefined)
            payslip.otherDeductions = num(body.otherDeductions);
        if (body.notes !== undefined)
            payslip.notes = String(body.notes);
        if (body.leaveTakenDays !== undefined) {
            await (0, leave_accrual_service_1.recalcPayslipLeave)(payslip, num(body.leaveTakenDays));
        }
        const grossPay = round2(num(payslip.baseSalary) + num(payslip.housingAllowance) + num(payslip.transportAllowance)
            + num(payslip.medicalAllowance) + num(payslip.otherAllowances));
        const totalDeductions = round2(num(payslip.payeAmount) + num(payslip.nssaAmount) + num(payslip.pensionAmount)
            + num(payslip.loanDeduction) + num(payslip.otherDeductions));
        payslip.grossPay = grossPay;
        payslip.totalDeductions = totalDeductions;
        payslip.netPay = round2(grossPay - totalDeductions);
        await repo.save(payslip);
    }
    const totals = await recalcRunTotals(payslip.payrollRunId);
    const run = await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).findOne({ where: { id: payslip.payrollRunId } });
    if (run) {
        run.staffCount = Number(totals?.cnt || 0);
        run.totalGross = num(totals?.gross);
        run.totalDeductions = num(totals?.deductions);
        run.totalNet = num(totals?.net);
        await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).save(run);
    }
    return repo.findOne({ where: { id: payslipId } });
}
var leave_accrual_service_2 = require("./leave-accrual.service");
Object.defineProperty(exports, "getStaffLeaveSummary", { enumerable: true, get: function () { return leave_accrual_service_2.getStaffLeaveSummary; } });
Object.defineProperty(exports, "listLeaveBalances", { enumerable: true, get: function () { return leave_accrual_service_2.listLeaveBalances; } });
