import { AppDataSource } from '../config/data-source';
import { Invoice, Payment, SchoolFee } from '../entities';

export const DEFAULT_SCHOOL_FEES: Partial<SchoolFee>[] = [
  { code: 'tuition', name: 'Tuition Fees', icon: '📚', sortOrder: 1, defaultAmount: 0, isActive: true },
  { code: 'bus_levy', name: 'Bus Levy', icon: '🚌', sortOrder: 2, defaultAmount: 0, isActive: true },
  { code: 'uniform', name: 'Uniform', icon: '👔', sortOrder: 3, defaultAmount: 0, isActive: true },
  { code: 'sports', name: 'Sports Levy', icon: '⚽', sortOrder: 4, defaultAmount: 0, isActive: true },
  { code: 'exam', name: 'Exam Fees', icon: '📝', sortOrder: 5, defaultAmount: 0, isActive: true },
  { code: 'tuckshop', name: 'Tuckshop', icon: '🍎', sortOrder: 6, defaultAmount: 0, isActive: true },
  { code: 'other', name: 'Other Levy', icon: '📋', sortOrder: 99, defaultAmount: 0, isActive: true },
];

export function normalizeFeeCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64);
}

export async function ensureDefaultSchoolFees(): Promise<void> {
  const repo = AppDataSource.getRepository(SchoolFee);
  const count = await repo.count();
  if (count > 0) return;
  await repo.save(DEFAULT_SCHOOL_FEES.map((f) => repo.create(f)));
}

export async function isFeeCodeInUse(code: string): Promise<boolean> {
  const [invoiceCount, paymentCount] = await Promise.all([
    AppDataSource.getRepository(Invoice).count({ where: { feeType: code } }),
    AppDataSource.getRepository(Payment).count({ where: { feeType: code } }),
  ]);
  return invoiceCount > 0 || paymentCount > 0;
}
