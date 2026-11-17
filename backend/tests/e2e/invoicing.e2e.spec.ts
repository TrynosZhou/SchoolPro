import request from 'supertest';
import app from '../../src/app';
import { AppDataSource } from '../../src/config/data-source';
import { Invoice, LedgerEntry } from '../../src/entities';
import { startTestApp, stopTestApp } from '../helpers/app';
import { createTestStudent } from '../helpers/factories';

describe('E2E: invoicing', () => {
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

  it('creates an invoice for a student and writes the matching ledger debit', async () => {
    const student = await createTestStudent();

    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: student.id,
        feeType: 'other',
        description: 'Textbooks',
        dueDate: '2026-12-01',
        lines: [{ description: 'Textbooks', quantity: 1, unitPrice: 25, amount: 25 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    expect(Number(res.body.totalAmount)).toBe(25);
    expect(Number(res.body.amountPaid)).toBe(0);
    expect(res.body.status).toBe('sent');

    const stored = await AppDataSource.getRepository(Invoice).findOne({ where: { id: res.body.id } });
    expect(stored).not.toBeNull();

    const ledger = await AppDataSource.getRepository(LedgerEntry).findOne({
      where: { referenceType: 'invoice', referenceId: res.body.id },
    });
    expect(ledger).not.toBeNull();
    expect(Number(ledger!.debit)).toBe(25);
    expect(Number(ledger!.credit)).toBe(0);
    expect(Number(ledger!.balance)).toBe(25);

    // The invoice shows up in the student's invoice list.
    const list = await request(app)
      .get(`/api/billing/invoices?studentId=${student.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.map((row: { id: string }) => row.id)).toContain(res.body.id);
  });

  it('rejects an invoice for an unknown student with 404', async () => {
    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: '00000000-0000-0000-0000-000000000000',
        feeType: 'other',
        description: 'Textbooks',
        dueDate: '2026-12-01',
        totalAmount: 10,
      });

    expect(res.status).toBe(404);
  });
});
