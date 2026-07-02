import { AppDataSource } from '../config/data-source';
import { Invoice, Term } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { relations } from '../utils/typeorm-helpers';
import { BALANCE_FORWARD_FEE_TYPE } from './term-balance.service';

const UNPAID_STATUSES = [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE];

function sortInvoicesNewestFirst(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort((a, b) => {
    const dateCmp = (b.issuedDate || b.dueDate || '').localeCompare(a.issuedDate || a.dueDate || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '');
  });
}

function pickBestInvoice(candidates: Invoice[]): Invoice | null {
  if (!candidates.length) return null;
  const sorted = sortInvoicesNewestFirst(candidates);
  const unpaid = sorted.filter((inv) => UNPAID_STATUSES.includes(inv.status));
  return unpaid[0] ?? sorted[0] ?? null;
}

/** Pick the invoice PDF parents/admins expect: current-term fee invoice, not old terms or carry-forward rows. */
export async function resolveStudentInvoiceForLookup(studentId: string): Promise<Invoice | null> {
  const termRepo = AppDataSource.getRepository(Term);
  const invoiceRepo = AppDataSource.getRepository(Invoice);

  const currentTerm = await termRepo.findOne({ where: { isCurrent: true } });
  const all = await invoiceRepo.find({
    where: { studentId },
    relations: relations('term'),
    order: { issuedDate: 'DESC', createdAt: 'DESC' },
  });

  const actionable = all.filter((inv) => inv.feeType !== BALANCE_FORWARD_FEE_TYPE);
  if (!actionable.length) return null;

  if (currentTerm) {
    const inCurrentTerm = actionable.filter((inv) => inv.termId === currentTerm.id);
    const picked = pickBestInvoice(inCurrentTerm);
    if (picked) return picked;
  }

  return pickBestInvoice(actionable);
}
