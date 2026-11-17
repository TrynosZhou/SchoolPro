import { AppDataSource } from '../../src/config/data-source';
import { GeneralLedgerEntry, PayrollRun, Payslip, StaffPayrollProfile } from '../../src/entities';
import { GlReferenceType, PayrollRunStatus, PayslipStatus } from '../../src/entities/enums';
import {
  calcFromProfile,
  createRun,
  markRunPaid,
  periodBounds,
  previewRun,
  processRun,
  updatePayslip,
  upsertProfile,
} from '../../src/services/payroll.service';
import { checkSystemGlBalance } from '../../src/services/ledger.service';
import { startTestApp, stopTestApp } from '../helpers/app';
import { createTestStaff, findAdminUserId } from '../helpers/factories';

describe('Unit: payroll service', () => {
  beforeAll(async () => {
    await startTestApp();
  });

  afterAll(async () => {
    await stopTestApp();
  });

  describe('periodBounds', () => {
    it('derives the label, date range and reference for a month', () => {
      expect(periodBounds(2026, 2)).toEqual({
        periodLabel: 'February 2026',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        reference: 'PAY-2026-02',
      });
    });

    it('handles a leap-year February', () => {
      expect(periodBounds(2024, 2).periodEnd).toBe('2024-02-29');
    });

    it('handles a 31-day month', () => {
      expect(periodBounds(2026, 1).periodEnd).toBe('2026-01-31');
    });
  });

  describe('calcFromProfile', () => {
    it('sums allowances into gross and deductions into net', () => {
      const profile = {
        baseSalary: 500,
        housingAllowance: 100.5,
        transportAllowance: 50.25,
        medicalAllowance: 0,
        otherAllowances: 0,
        payeAmount: 80.1,
        nssaAmount: 20.05,
        pensionAmount: 0,
        loanDeduction: 0,
        otherDeductions: 0.05,
      } as StaffPayrollProfile;

      const calc = calcFromProfile(profile);
      expect(calc.grossPay).toBe(650.75);
      expect(calc.totalDeductions).toBe(100.2);
      expect(calc.netPay).toBe(550.55);
    });

    it('treats missing numeric fields as zero', () => {
      const calc = calcFromProfile({ baseSalary: 1000 } as StaffPayrollProfile);
      expect(calc.grossPay).toBe(1000);
      expect(calc.totalDeductions).toBe(0);
      expect(calc.netPay).toBe(1000);
    });
  });

  describe('run lifecycle', () => {
    // A far-future period so this file never collides with real payroll history.
    const YEAR = 2031;
    const MONTH = 6;
    const REFERENCE = `PAY-${YEAR}-0${MONTH}`;

    it('rejects an out-of-range month', async () => {
      await expect(createRun(YEAR, 13, {})).rejects.toThrow('Invalid month');
    });

    it('previews, creates, edits, processes and pays a run, posting salaries to the GL', async () => {
      const { staff } = await createTestStaff();
      const adminId = await findAdminUserId();

      await upsertProfile(staff.id, {
        jobTitle: 'Teacher',
        baseSalary: 1000,
        housingAllowance: 200,
        transportAllowance: 100,
        medicalAllowance: 0,
        otherAllowances: 0,
        payeAmount: 150,
        nssaAmount: 40,
        pensionAmount: 0,
        loanDeduction: 0,
        otherDeductions: 0,
        annualLeaveDays: 12,
      });

      const preview = await previewRun(YEAR, MONTH);
      const previewed = preview.included.find((row) => row.staffId === staff.id);
      expect(previewed).toBeDefined();
      expect(previewed!.grossPay).toBe(1300);
      expect(previewed!.netPay).toBe(1110);
      expect(preview.reference).toBe(REFERENCE);

      const created = await createRun(YEAR, MONTH, {});
      expect(created).not.toBeNull();
      expect(created!.run.status).toBe(PayrollRunStatus.DRAFT);
      expect(created!.run.reference).toBe(REFERENCE);

      const payslip = created!.payslips.find((p) => p.staffId === staff.id);
      expect(payslip).toBeDefined();
      expect(Number(payslip!.grossPay)).toBe(1300);
      expect(Number(payslip!.totalDeductions)).toBe(190);
      expect(Number(payslip!.netPay)).toBe(1110);
      expect(payslip!.status).toBe(PayslipStatus.PENDING);

      // A second run for the same period is refused.
      await expect(createRun(YEAR, MONTH, {})).rejects.toThrow(/already exists/i);

      // Editing a payslip recalculates its totals and the run totals.
      const edited = await updatePayslip(payslip!.id, { otherDeductions: 10 });
      expect(Number(edited!.netPay)).toBe(1100);
      expect(Number(edited!.totalDeductions)).toBe(200);

      const afterEdit = await AppDataSource.getRepository(PayrollRun).findOne({
        where: { id: created!.run.id },
      });
      expect(Number(afterEdit!.totalNet)).toBe(1100);
      expect(afterEdit!.staffCount).toBe(created!.payslips.length);

      // Payslips are frozen once the run leaves draft.
      await processRun(created!.run.id, adminId);
      await expect(updatePayslip(payslip!.id, { baseSalary: 5000 })).rejects.toThrow(
        /draft payroll runs/i,
      );

      // Paying the run posts a balanced salary journal to the general ledger.
      await markRunPaid(created!.run.id, adminId);

      const glEntry = await AppDataSource.getRepository(GeneralLedgerEntry).findOne({
        where: { referenceType: GlReferenceType.SALARY, referenceId: created!.run.id },
      });
      expect(glEntry).not.toBeNull();

      const balance = await checkSystemGlBalance();
      expect(balance.balanced).toBe(true);

      const paidRun = await AppDataSource.getRepository(PayrollRun).findOne({
        where: { id: created!.run.id },
      });
      expect(paidRun!.status).toBe(PayrollRunStatus.PAID);
      expect(paidRun!.paidAt).toBeTruthy();

      const paidPayslips = await AppDataSource.getRepository(Payslip).find({
        where: { payrollRunId: created!.run.id, status: PayslipStatus.PAID },
      });
      expect(paidPayslips.length).toBeGreaterThan(0);
    });
  });
});
