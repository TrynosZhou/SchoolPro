import { calcFromProfile, periodBounds } from '../../services/payroll.service';

describe('payroll calculations', () => {
  it('builds period bounds in UTC, including leap-year February', () => {
    expect(periodBounds(2026, 1)).toMatchObject({ periodLabel: 'January 2026', periodStart: '2026-01-01', periodEnd: '2026-01-31', reference: 'PAY-2026-01' });
    expect(periodBounds(2024, 2).periodEnd).toBe('2024-02-29');
    expect(periodBounds(2026, 2).periodEnd).toBe('2026-02-28');
    expect(periodBounds(2026, 12)).toMatchObject({ periodStart: '2026-12-01', periodEnd: '2026-12-31', reference: 'PAY-2026-12' });
  });

  it('computes gross, deductions and net pay', () => {
    const r = calcFromProfile({
      baseSalary: '1000', housingAllowance: '200.10', transportAllowance: 50, medicalAllowance: 0, otherAllowances: '10',
      payeAmount: '120.55', nssaAmount: 45, pensionAmount: 30, loanDeduction: 25, otherDeductions: 0,
    } as any);
    expect(r.grossPay).toBe(1260.1);
    expect(r.totalDeductions).toBe(220.55);
    expect(r.netPay).toBe(1039.55);
  });

  it('treats missing/invalid numbers as zero', () => {
    const r = calcFromProfile({ baseSalary: undefined, housingAllowance: 'abc', payeAmount: null } as any);
    expect(r.grossPay).toBe(0);
    expect(r.netPay).toBe(0);
  });

  it('allows a negative net when deductions exceed gross (so it can be flagged)', () => {
    expect(calcFromProfile({ baseSalary: 100, payeAmount: 150 } as any).netPay).toBe(-50);
  });
});
