import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { computePaynowHash } from '../../services/paynow.service';
import { makeRepo } from '../helpers';

const repos: Record<string, any> = {};
const qr: any = {};

jest.mock('../../config/data-source', () => ({
  AppDataSource: {
    getRepository: (e: any) => repos[e?.name],
    createQueryRunner: () => qr,
    manager: { query: jest.fn(async () => [{ owed: '0' }]) },
    // atomic "claim" used by the Paynow webhook: pending -> processing
    query: jest.fn(async (_sql: string, [id]: string[]) => {
      const intent = repos.PaymentIntent.rows.find((i: any) => i.id === id);
      if (intent && intent.status === 'pending') { intent.status = 'processing'; return [{ id }]; }
      return [];
    }),
  },
}));
jest.mock('../../utils/pdf', () => ({ generateInvoicePdf: jest.fn(async () => '/pdf/inv.pdf'), generateReceiptPdf: jest.fn(async () => '/pdf/rcp.pdf') }));
jest.mock('../../services/school-branding.service', () => ({ loadSchoolBranding: jest.fn(async () => ({})) }));
jest.mock('../../services/whatsapp.service', () => ({ sendWhatsAppReminder: jest.fn(async () => true), sendSmsMessage: jest.fn() }));
jest.mock('../../services/gl-posting.service', () => ({ postFeePaymentToGl: jest.fn() }));
jest.mock('../../services/registration-invoice.service', () => ({
  ensureRegistrationSchoolFees: jest.fn(),
  quoteTuitionForStudent: jest.fn(async () => ({ amount: 250, feeCode: 'tuition_day', description: 'Day tuition' })),
}));
jest.mock('../../services/term-balance.service', () => ({
  BALANCE_FORWARD_FEE_TYPE: 'balance_forward',
  roundMoney: (n: number) => Math.round(n * 100) / 100,
  ensureTermBalanceInitialized: jest.fn(), applyAvailablePrepaidToInvoice: jest.fn(),
  refreshTermClosingBalance: jest.fn(), recordOverpaymentPrepaid: jest.fn(),
  resolvePaymentTermId: jest.fn(async () => 'term-1'), carryForwardBalancesForTerm: jest.fn(), getTermBalanceSummary: jest.fn(),
}));
for (const m of ['fin-reports', 'bulk-tuition-invoice', 'tuition-exemption', 'invoice-adjustment', 'fee-collection-revenue', 'invoice-lookup', 'fee-catalog']) {
  jest.mock(`../../services/${m}.service`, () => ({}));
}
jest.mock('../../services/paynow.service', () => ({
  ...jest.requireActual('../../services/paynow.service'),
  getPaynowConfig: jest.fn(async () => ({ enabled: true, integrationId: 'id', integrationKey: 'KEY' })),
  isPaynowConfigured: jest.fn(async () => true),
  pollPaynowStatus: jest.fn(async () => ({ ok: false })),
  initiatePaynowTransaction: jest.fn(async () => ({
    ok: true, paynowReference: 'PN-1', pollUrl: 'https://paynow.test/poll/1', browserUrl: 'https://paynow.test/pay/1', instructions: 'Approve on your phone', raw: {},
  })),
}));

import billingRoutes from '../../routes/billing.routes';
import webhooksRoutes from '../../routes/webhooks.routes';
import { AccessControlService } from '../../services/access-control.service';
import { postFeePaymentToGl } from '../../services/gl-posting.service';
import { env } from '../../config/env';

const app = express();
app.use(express.json());
app.use('/billing', billingRoutes);
app.use('/webhooks', webhooksRoutes);

const token = (role: string, userId: string) => jwt.sign({ userId, email: `${userId}@x.test`, role, permissions: [] }, env.jwt.secret);
const adminAuth = () => ({ Authorization: `Bearer ${token('admin', 'admin1')}` });
const parentAuth = () => ({ Authorization: `Bearer ${token('parent', 'parent1')}` });

beforeEach(() => {
  for (const k of ['Invoice', 'LedgerEntry', 'Term', 'Payment', 'PaymentIntent', 'Receipt', 'Notification', 'CashbookEntry', 'Guardian', 'Message', 'User']) repos[k] = makeRepo();
  repos.Student = makeRepo([{ id: 's1', firstName: 'Tendai', lastName: 'Moyo', admissionNumber: 'SP1', classId: 'c1', schoolClass: { name: '1A' }, guardians: [] }]);
  repos.Term = makeRepo([{ id: 't1', name: 'Term 1' }]);
  Object.assign(qr, {
    connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    manager: { getRepository: (e: any) => repos[e.name], query: jest.fn(async () => [{ owed: '0' }]) },
  });
  jest.spyOn(AccessControlService, 'userCanAccessStudent').mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('invoicing → online payment → receipt', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).post('/billing/invoices').send({})).status).toBe(401);
  });

  it('creates a tuition invoice from the fee catalogue and debits the student ledger', async () => {
    const res = await request(app).post('/billing/invoices').set(adminAuth()).send({ studentId: 's1', termId: 't1', feeType: 'tuition', dueDate: '2026-12-01' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ studentId: 's1', totalAmount: 250, status: 'sent', pdfPath: '/pdf/inv.pdf' });
    expect(res.body.invoiceNumber).toMatch(/^INV/);
    expect(repos.LedgerEntry.rows[0]).toMatchObject({ studentId: 's1', debit: 250, credit: 0, balance: 250, referenceType: 'invoice' });
  });

  it('returns 404 for an unknown student', async () => {
    const res = await request(app).post('/billing/invoices').set(adminAuth()).send({ studentId: 'nope', feeType: 'tuition' });
    expect(res.status).toBe(404);
  });

  it('parent starts a Paynow payment, the signed webhook settles the invoice exactly once', async () => {
    const inv = await request(app).post('/billing/invoices').set(adminAuth()).send({ studentId: 's1', termId: 't1', feeType: 'tuition' });
    const invoiceId = inv.body.id;

    const init = await request(app).post('/billing/payments/paynow/initiate').set(parentAuth())
      .send({ studentId: 's1', invoiceId, amount: 250, method: 'ecocash', phone: '0771234567' });
    expect(init.status).toBe(201);
    expect(init.body).toMatchObject({ method: 'ecocash', instructions: 'Approve on your phone' });
    const { reference } = init.body;
    expect(repos.PaymentIntent.rows[0]).toMatchObject({ reference, status: 'pending', amount: 250 });

    // Paynow calls back (form-encoded, signed with the integration key)
    const fields = { reference, paynowreference: 'PN-1', amount: '250.00', status: 'Paid', pollurl: 'https://paynow.test/poll/1' };
    const body = new URLSearchParams({ ...fields, hash: computePaynowHash(fields, 'KEY') }).toString();
    const hook = await request(app).post('/webhooks/paynow').type('form').send(body);
    expect(hook.status).toBe(200);

    expect(repos.Invoice.rows[0]).toMatchObject({ amountPaid: 250, status: 'paid' });
    expect(repos.Payment.rows).toHaveLength(1);
    expect(repos.Receipt.rows[0]).toMatchObject({ pdfPath: '/pdf/rcp.pdf' });
    expect(repos.LedgerEntry.rows.at(-1)).toMatchObject({ credit: 250, referenceType: 'payment' });
    expect(postFeePaymentToGl).toHaveBeenCalledTimes(1);
    expect(repos.PaymentIntent.rows[0].status).toBe('paid');

    // Paynow retries the callback: nothing is posted twice.
    await request(app).post('/webhooks/paynow').type('form').send(body);
    expect(repos.Payment.rows).toHaveLength(1);
    expect(postFeePaymentToGl).toHaveBeenCalledTimes(1);

    // Portal polls the status and gets the receipt.
    const status = await request(app).get(`/billing/payments/paynow/${reference}`).set(parentAuth());
    expect(status.body).toMatchObject({ status: 'paid', amount: 250 });
    expect(status.body.receiptNumber).toBeDefined();
  });

  it('webhook with a forged hash is rejected and posts nothing', async () => {
    const init = await request(app).post('/billing/payments/paynow/initiate').set(parentAuth()).send({ studentId: 's1', amount: 50, method: 'visa' });
    const body = new URLSearchParams({ reference: init.body.reference, status: 'Paid', amount: '50.00', hash: 'FORGED' }).toString();
    const hook = await request(app).post('/webhooks/paynow').type('form').send(body);
    expect(hook.status).toBe(400);
    expect(repos.Payment.rows).toHaveLength(0);
  });

  it('validates the initiate request', async () => {
    const send = (b: any) => request(app).post('/billing/payments/paynow/initiate').set(parentAuth()).send(b);
    expect((await send({ amount: 10, method: 'visa' })).status).toBe(400);            // no student
    expect((await send({ studentId: 's1', amount: 0, method: 'visa' })).status).toBe(400);
    expect((await send({ studentId: 's1', amount: 10, method: 'bitcoin' })).status).toBe(400);
  });

  it('staff can also record a manual cashier payment through the same posting path', async () => {
    const inv = await request(app).post('/billing/invoices').set(adminAuth()).send({ studentId: 's1', termId: 't1', feeType: 'tuition' });
    const res = await request(app).post('/billing/payments').set(adminAuth())
      .send({ studentId: 's1', invoiceId: inv.body.id, amount: 100, method: 'cash', feeType: 'tuition', label: 'Cash at office' });
    expect(res.status).toBe(201);
    expect(repos.Invoice.rows[0]).toMatchObject({ amountPaid: 100, status: 'partial' });
    expect(postFeePaymentToGl).toHaveBeenCalledTimes(1);
  });
});
