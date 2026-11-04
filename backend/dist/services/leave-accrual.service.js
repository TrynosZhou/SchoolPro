"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ANNUAL_LEAVE_DAYS = void 0;
exports.roundLeaveDays = roundLeaveDays;
exports.monthlyLeaveAccrual = monthlyLeaveAccrual;
exports.annualLeaveFromProfile = annualLeaveFromProfile;
exports.getOrCreateLeaveBalance = getOrCreateLeaveBalance;
exports.applyMonthlyLeaveAccrual = applyMonthlyLeaveAccrual;
exports.recalcPayslipLeave = recalcPayslipLeave;
exports.reverseLeaveAccrualForRun = reverseLeaveAccrualForRun;
exports.listLeaveBalances = listLeaveBalances;
exports.getStaffLeaveSummary = getStaffLeaveSummary;
exports.hasLeaveAccrualForPeriod = hasLeaveAccrualForPeriod;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
exports.DEFAULT_ANNUAL_LEAVE_DAYS = 12;
function num(v) {
    return Number(v) || 0;
}
/** Round leave days to 2 decimal places (supports half-days later). */
function roundLeaveDays(n) {
    return Math.round(n * 100) / 100;
}
/** Monthly accrual: (Annual entitlement) / 12 */
function monthlyLeaveAccrual(annualEntitlementDays) {
    const annual = annualEntitlementDays > 0 ? annualEntitlementDays : exports.DEFAULT_ANNUAL_LEAVE_DAYS;
    return roundLeaveDays(annual / 12);
}
function annualLeaveFromProfile(profile) {
    const days = profile?.annualLeaveDays;
    return days != null && num(days) > 0 ? num(days) : exports.DEFAULT_ANNUAL_LEAVE_DAYS;
}
async function getOrCreateLeaveBalance(staffId, annualEntitlement) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance);
    let row = await repo.findOne({ where: { staffId } });
    const annual = annualEntitlement != null && annualEntitlement > 0
        ? annualEntitlement
        : exports.DEFAULT_ANNUAL_LEAVE_DAYS;
    if (!row) {
        row = await repo.save(repo.create({
            staffId,
            annualEntitlementDays: annual,
            balanceDays: 0,
        }));
    }
    else if (annualEntitlement != null && num(row.annualEntitlementDays) !== annual) {
        row.annualEntitlementDays = annual;
        await repo.save(row);
    }
    return row;
}
/** Compute leave figures for a new payslip and update staff balance. */
async function applyMonthlyLeaveAccrual(staffId, profile, leaveTakenDays = 0) {
    const annual = annualLeaveFromProfile(profile);
    const accrual = monthlyLeaveAccrual(annual);
    const taken = roundLeaveDays(Math.max(0, leaveTakenDays));
    const balanceRepo = data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance);
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
async function recalcPayslipLeave(payslip, newLeaveTaken) {
    const taken = roundLeaveDays(Math.max(0, newLeaveTaken));
    const opening = roundLeaveDays(num(payslip.leaveOpeningBalance));
    const accrual = roundLeaveDays(num(payslip.monthlyLeaveAccrual));
    const oldTaken = roundLeaveDays(num(payslip.leaveTakenDays));
    const closing = roundLeaveDays(opening + accrual - taken);
    const balanceRepo = data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance);
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
async function reverseLeaveAccrualForRun(runId) {
    const payslips = await data_source_1.AppDataSource.getRepository(entities_1.Payslip).find({ where: { payrollRunId: runId } });
    const balanceRepo = data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance);
    for (const p of payslips) {
        const balance = await balanceRepo.findOne({ where: { staffId: p.staffId } });
        if (!balance)
            continue;
        const opening = roundLeaveDays(num(p.leaveOpeningBalance));
        balance.balanceDays = opening;
        await balanceRepo.save(balance);
    }
}
async function listLeaveBalances() {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.StaffLeaveBalance)
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
async function getStaffLeaveSummary(staffId) {
    const profile = await data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile).findOne({ where: { staffId } });
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
async function hasLeaveAccrualForPeriod(staffId, year, month, excludeRunId) {
    const qb = data_source_1.AppDataSource.getRepository(entities_1.Payslip)
        .createQueryBuilder('p')
        .innerJoin('p.payrollRun', 'r')
        .where('p.staffId = :staffId', { staffId })
        .andWhere('r.year = :year', { year })
        .andWhere('r.month = :month', { month })
        .andWhere('r.status != :cancelled', { cancelled: enums_1.PayrollRunStatus.CANCELLED });
    if (excludeRunId)
        qb.andWhere('r.id != :excludeRunId', { excludeRunId });
    const count = await qb.getCount();
    return count > 0;
}
