import request from 'supertest';
import app from '../../src/app';
import { AppDataSource } from '../../src/config/data-source';
import { GeneralLedgerEntry, Invoice, LedgerEntry, Payment } from '../../src/entities';
import { GlReferenceType, InvoiceStatus } from '../../src/entities/enums';
import { checkSystemGlBalance } from '../../src/services/ledger.service';
import { startTestApp, stopTestApp } from '../helpers/app';
import { createTestStudent, uniqueTag } from '../helpers/factories';

async function createInvoice(studentId: string, totalAmount: number): Promise<Invoice> {
  const repo = AppDataSource.getRepository(Invoice);
  return repo.save(
    repo.create({
      invoiceNumber: `INV-E2E-${uniqueTag().toUpperCase()}`,
      studentId,
      feeType: 'tuition',
      description: 'Term fees',
      totalAmount,
      amountPaid: 0,
      status: InvoiceStatus.SENT,
      dueDate: '2026-12-01',
    }),
  );
}

describe('E2E: fee payment', () => {
  let token: string;

  beforeAll(async () => {
    await startTestApp();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });
    token = login.body.token;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    await stopTestApp();
  });

  it('pays an invoice over HTTP and returns the payment plus a receipt', async () => {
    const student = await createTestStudent();
    const invoice = await createInvoice(student.id, 180);

    const res = await request(app)
      .post('/api/billing/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: student.id,
        invoiceId: invoice.id,
        amount: 180,
        method: 'ecocash',
        feeType: 'tuition',
        label: 'Term fees',
      });

    expect(res.status).toBe(201);
    expect(res.body.payment).toBeTruthy();
    expect(res.body.payment.paymentReference).toMatch(/^PAY-/);
    expect(res.body.receipt).toBeTruthy();
    expect(res.body.receipt.receiptNumber).toMatch(/^RCP-/);
    expect(res.body.receipt.paymentId).toBe(res.body.payment.id);

    // The invoice is settled...
    const settled = await AppDataSource.getRepository(Invoice).findOne({ where: { id: invoice.id } });
    expect(settled!.status).toBe(InvoiceStatus.PAID);
    expect(Number(settled!.amountPaid)).toBe(180);

    // ...the student ledger and the general ledger are both updated...
    const studentLedger = await AppDataSource.getRepository(LedgerEntry).findOne({
      where: { referenceType: 'payment', referenceId: res.body.payment.id },
    });
    expect(Number(studentLedger!.credit)).toBe(180);

    const glEntries = await AppDataSource.getRepository(GeneralLedgerEntry).find({
      where: { referenceType: GlReferenceType.FEE_PAYMENT, referenceId: res.body.payment.id },
    });
    expect(glEntries.length).toBe(2);

    const balance = await checkSystemGlBalance();
    expect(balance.balanced).toBe(true);

    // ...and the payment is queryable through the finance payments feed.
    const payments = await request(app)
      .get('/api/billing/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(payments.status).toBe(200);
    const ids = (payments.body.payments ?? payments.body).map((row: { id: string }) => row.id);
    expect(ids).toContain(res.body.payment.id);
  });

  it('rejects a zero-amount payment with 400 and records nothing', async () => {
    const student = await createTestStudent();
    const before = await AppDataSource.getRepository(Payment).count();

    const res = await request(app)
      .post('/api/billing/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: student.id,
        amount: 0,
        method: 'cash',
        feeType: 'tuition',
        label: 'Term fees',
      });

    expect(res.status).toBe(400);
    expect(await AppDataSource.getRepository(Payment).count()).toBe(before);
  });

  it('rejects a payment for an unknown student with 404', async () => {
    const res = await request(app)
      .post('/api/billing/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: '00000000-0000-0000-0000-000000000000',
        amount: 10,
        method: 'cash',
        feeType: 'tuition',
        label: 'Term fees',
      });

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/billing/payments').send({ amount: 10 });
    expect(res.status).toBe(401);
  });
});
