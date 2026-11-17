import { AppDataSource } from '../../src/config/data-source';
import {
  CashbookEntry,
  GeneralLedgerEntry,
  Invoice,
  LedgerEntry,
  Payment,
  Receipt,
} from '../../src/entities';
import { GlReferenceType, InvoiceStatus, PaymentMethod } from '../../src/entities/enums';
import { checkSystemGlBalance } from '../../src/services/ledger.service';
import { recordFeePayment } from '../../src/services/payment-recording.service';
import { startTestApp, stopTestApp } from '../helpers/app';
import { createTestStudent, findAdminUserId, uniqueTag } from '../helpers/factories';

/** Creates an unpaid invoice directly so the payment-service behaviour is isolated. */
async function createInvoice(
  studentId: string,
  totalAmount: number,
  dueDate = '2026-12-01',
): Promise<Invoice> {
  const repo = AppDataSource.getRepository(Invoice);
  return repo.save(
    repo.create({
      invoiceNumber: `INV-TEST-${uniqueTag().toUpperCase()}`,
      studentId,
      feeType: 'tuition',
      description: 'Term fees',
      totalAmount,
      amountPaid: 0,
      status: InvoiceStatus.SENT,
      dueDate,
    }),
  );
}

describe('Unit: finance / fee payment service', () => {
  let adminId: string;

  beforeAll(async () => {
    await startTestApp();
    adminId = await findAdminUserId();
  });

  afterAll(async () => {
    await stopTestApp();
  });

  it('rejects a non-positive amount', async () => {
    const student = await createTestStudent();
    await expect(
      recordFeePayment({
        studentId: student.id,
        amount: 0,
        method: PaymentMethod.CASH,
        feeType: 'tuition',
        label: 'Term fees',
        recordedById: adminId,
      }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('rejects an unknown student', async () => {
    await expect(
      recordFeePayment({
        studentId: '00000000-0000-0000-0000-000000000000',
        amount: 10,
        method: PaymentMethod.CASH,
        feeType: 'tuition',
        label: 'Term fees',
        recordedById: adminId,
      }),
    ).rejects.toThrow(/student not found/i);
  });

  it('settles an invoice in full and books the ledger, cashbook, GL and receipt', async () => {
    const student = await createTestStudent();
    const invoice = await createInvoice(student.id, 300);

    const { payment, receipt } = await recordFeePayment({
      studentId: student.id,
      invoiceId: invoice.id,
      amount: 300,
      method: PaymentMethod.ECOCASH,
      feeType: 'tuition',
      label: 'Term fees',
      recordedById: adminId,
    });

    expect(payment.paymentReference).toMatch(/^PAY-/);
    expect(Number(payment.amount)).toBe(300);
    expect(receipt.receiptNumber).toMatch(/^RCP-/);
    expect(receipt.paymentId).toBe(payment.id);
    expect(receipt.pdfPath).toBeTruthy();

    const settled = await AppDataSource.getRepository(Invoice).findOne({ where: { id: invoice.id } });
    expect(Number(settled!.amountPaid)).toBe(300);
    expect(settled!.status).toBe(InvoiceStatus.PAID);

    // Student AR subledger gets a credit that reduces the running balance.
    const ledgerEntry = await AppDataSource.getRepository(LedgerEntry).findOne({
      where: { referenceType: 'payment', referenceId: payment.id },
    });
    expect(ledgerEntry).not.toBeNull();
    expect(Number(ledgerEntry!.debit)).toBe(0);
    expect(Number(ledgerEntry!.credit)).toBe(300);
    expect(Number(ledgerEntry!.balance)).toBe(-300);

    // Cashbook receipt.
    const cashbook = await AppDataSource.getRepository(CashbookEntry).findOne({
      where: { reference: payment.paymentReference },
    });
    expect(cashbook).not.toBeNull();
    expect(Number(cashbook!.moneyIn)).toBe(300);
    expect(cashbook!.paymentMethod).toBe(PaymentMethod.ECOCASH);

    // Double-entry general ledger posting for the fee payment.
    const glEntries = await AppDataSource.getRepository(GeneralLedgerEntry).find({
      where: { referenceType: GlReferenceType.FEE_PAYMENT, referenceId: payment.id },
    });
    expect(glEntries.length).toBe(2);
    expect(await checkSystemGlBalance()).toMatchObject({ balanced: true, variance: 0 });

    // A receipt row is persisted for the parent portal.
    const receiptRow = await AppDataSource.getRepository(Receipt).findOne({
      where: { id: receipt.id },
    });
    expect(receiptRow).not.toBeNull();
    expect(receiptRow!.receiptNumber).toBe(receipt.receiptNumber);
  });

  it('records a partial payment and leaves the invoice partially paid', async () => {
    const student = await createTestStudent();
    const invoice = await createInvoice(student.id, 300);

    await recordFeePayment({
      studentId: student.id,
      invoiceId: invoice.id,
      amount: 120,
      method: PaymentMethod.CASH,
      feeType: 'tuition',
      label: 'Term fees',
      recordedById: adminId,
    });

    const partial = await AppDataSource.getRepository(Invoice).findOne({ where: { id: invoice.id } });
    expect(Number(partial!.amountPaid)).toBe(120);
    expect(partial!.status).toBe(InvoiceStatus.PARTIAL);
  });

  it('auto-allocates a payment to the oldest outstanding invoice when none is given', async () => {
    const student = await createTestStudent();
    const older = await createInvoice(student.id, 100, '2026-01-15');
    const newer = await createInvoice(student.id, 100, '2026-06-15');

    const { payment } = await recordFeePayment({
      studentId: student.id,
      amount: 100,
      method: PaymentMethod.BANK,
      feeType: 'tuition',
      label: 'Term fees',
      recordedById: adminId,
    });

    const settled = await AppDataSource.getRepository(Invoice).findOne({ where: { id: older.id } });
    const untouched = await AppDataSource.getRepository(Invoice).findOne({ where: { id: newer.id } });
    expect(settled!.status).toBe(InvoiceStatus.PAID);
    expect(Number(untouched!.amountPaid)).toBe(0);
    expect(untouched!.status).toBe(InvoiceStatus.SENT);

    // The payment is linked back to the invoice it settled.
    const stored = await AppDataSource.getRepository(Payment).findOne({ where: { id: payment.id } });
    expect(stored!.invoiceId).toBe(older.id);
  });

  it('keeps the general ledger balanced across every payment recorded above', async () => {
    const balance = await checkSystemGlBalance();
    expect(balance.balanced).toBe(true);
  });
});
