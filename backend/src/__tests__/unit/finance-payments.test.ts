import { InvoiceStatus, PaymentMethod } from '../../entities/enums';
import { makeRepo } from '../helpers';

const mockQueryRunner: any = {};
const repos: Record<string, any> = {};
let studentRepo: any;

jest.mock('../../config/data-source', () => ({
  AppDataSource: {
    getRepository: (e: any) => (e?.name === 'Student' ? studentRepo : repos[e?.name]),
    createQueryRunner: () => mockQueryRunner,
    manager: { query: jest.fn(async () => [{ owed: '0' }]) },
  },
}));
jest.mock('../../services/gl-posting.service', () => ({ postFeePaymentToGl: jest.fn() }));
jest.mock('../../utils/pdf', () => ({ generateReceiptPdf: jest.fn(async () => '/receipts/r.pdf') }));
jest.mock('../../services/school-branding.service', () => ({ loadSchoolBranding: jest.fn(async () => ({})) }));
jest.mock('../../services/whatsapp.service', () => ({ sendWhatsAppReminder: jest.fn(async () => true) }));
jest.mock('../../services/term-balance.service', () => ({
  recordOverpaymentPrepaid: jest.fn(),
  refreshTermClosingBalance: jest.fn(),
  resolvePaymentTermId: jest.fn(async () => 'term-1'),
  roundMoney: (n: number) => Math.round(n * 100) / 100,
}));

import { recordFeePayment } from '../../services/payment-recording.service';
import { postFeePaymentToGl } from '../../services/gl-posting.service';
import { recordOverpaymentPrepaid } from '../../services/term-balance.service';
import { sendWhatsAppReminder } from '../../services/whatsapp.service';

function setup(invoices: any[] = []) {
  for (const k of ['Payment', 'Invoice', 'LedgerEntry', 'CashbookEntry', 'Receipt', 'Notification', 'Guardian', 'Message']) {
    repos[k] = makeRepo(k === 'Invoice' ? invoices : []);
  }
  studentRepo = makeRepo([{ id: 's1', firstName: 'Tendai', lastName: 'Moyo', admissionNumber: 'SP1', classId: 'c1', schoolClass: { name: '1A' }, guardians: [{ isPrimary: true, phone: '+263771234567' }] }]);
  Object.assign(mockQueryRunner, {
    connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    manager: { getRepository: (e: any) => repos[e.name], query: jest.fn(async () => [{ owed: '0' }]) },
  });
}

const input = { studentId: 's1', amount: 100, method: PaymentMethod.ECOCASH, feeType: 'tuition', label: 'Online payment', recordedById: 'admin1' };

describe('recordFeePayment', () => {
  it('fully pays an invoice, writes ledger + cashbook, posts to GL and issues a receipt', async () => {
    setup([{ id: 'inv1', studentId: 's1', totalAmount: 100, amountPaid: 0, status: InvoiceStatus.SENT, termId: 't1', invoiceNumber: 'INV-1' }]);
    const { payment, receipt } = await recordFeePayment({ ...input, invoiceId: 'inv1' });

    expect(repos.Invoice.rows[0]).toMatchObject({ amountPaid: 100, status: InvoiceStatus.PAID });
    expect(repos.LedgerEntry.rows[0]).toMatchObject({ studentId: 's1', credit: 100, debit: 0, referenceType: 'payment', referenceId: payment.id });
    expect(repos.CashbookEntry.rows[0]).toMatchObject({ moneyIn: 100, paymentMethod: PaymentMethod.ECOCASH });
    expect(postFeePaymentToGl).toHaveBeenCalledWith(mockQueryRunner.manager, expect.objectContaining({ id: payment.id }), 'admin1');
    expect(receipt).toMatchObject({ paymentId: payment.id, pdfPath: '/receipts/r.pdf' });
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
    expect(sendWhatsAppReminder).toHaveBeenCalled();
  });

  it('marks partial payments as partial', async () => {
    setup([{ id: 'inv1', studentId: 's1', totalAmount: 300, amountPaid: 0, status: InvoiceStatus.SENT }]);
    await recordFeePayment({ ...input, invoiceId: 'inv1' });
    expect(repos.Invoice.rows[0]).toMatchObject({ amountPaid: 100, status: InvoiceStatus.PARTIAL });
  });

  it('records overpayment as prepaid credit', async () => {
    setup([{ id: 'inv1', studentId: 's1', totalAmount: 60, amountPaid: 0, status: InvoiceStatus.SENT, termId: 't1' }]);
    await recordFeePayment({ ...input, invoiceId: 'inv1' });
    expect(recordOverpaymentPrepaid).toHaveBeenCalledWith('s1', 't1', 40);
  });

  it('auto-allocates oldest invoice first when no invoice is given', async () => {
    setup([
      { id: 'a', studentId: 's1', totalAmount: 60, amountPaid: 0, status: InvoiceStatus.SENT },
      { id: 'b', studentId: 's1', totalAmount: 100, amountPaid: 0, status: InvoiceStatus.SENT },
    ]);
    const { payment } = await recordFeePayment(input);
    expect(repos.Invoice.rows[0]).toMatchObject({ amountPaid: 60, status: InvoiceStatus.PAID });
    expect(repos.Invoice.rows[1]).toMatchObject({ amountPaid: 40, status: InvoiceStatus.PARTIAL });
    expect(payment.invoiceId).toBe('a');
  });

  it('rejects non-positive amounts and unknown students without touching the database', async () => {
    setup();
    await expect(recordFeePayment({ ...input, amount: 0 })).rejects.toThrow(/greater than zero/);
    await expect(recordFeePayment({ ...input, studentId: 'nope' })).rejects.toThrow(/Student not found/);
    expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('rolls back and releases if GL posting fails', async () => {
    setup([{ id: 'inv1', studentId: 's1', totalAmount: 100, amountPaid: 0, status: InvoiceStatus.SENT }]);
    (postFeePaymentToGl as jest.Mock).mockRejectedValueOnce(new Error('gl down'));
    await expect(recordFeePayment({ ...input, invoiceId: 'inv1' })).rejects.toThrow('gl down');
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });
});
