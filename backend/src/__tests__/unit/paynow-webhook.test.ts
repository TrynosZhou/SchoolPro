import { computePaynowHash } from '../../services/paynow.service';

const KEY = 'k';
const intentRepo: any = {};
let queryMock: jest.Mock;

jest.mock('../../config/data-source', () => ({
  AppDataSource: {
    getRepository: (e: any) => (e?.name === 'PaymentIntent' ? intentRepo : { findOne: jest.fn(async () => ({ feeType: 'tuition' })), find: jest.fn(async () => [{ id: 'admin1' }]) }),
    query: (...a: any[]) => queryMock(...a),
  },
}));
jest.mock('../../services/payment-recording.service', () => ({ recordFeePayment: jest.fn(async () => ({ payment: { id: 'pay1', paymentReference: 'PAY-1' }, receipt: {} })) }));
jest.mock('../../services/paynow.service', () => ({
  ...jest.requireActual('../../services/paynow.service'),
  getPaynowConfig: jest.fn(async () => ({ enabled: true, integrationId: 'id', integrationKey: 'k' })),
}));

import { applyPaynowResult } from '../../services/paynow-intent.service';
import { recordFeePayment } from '../../services/payment-recording.service';
import { getPaynowConfig } from '../../services/paynow.service';

const signed = (fields: Record<string, string>) => ({ ...fields, hash: computePaynowHash(fields, KEY) });
const freshIntent = () => ({ id: 'i1', reference: 'PYI1', studentId: 's1', invoiceId: 'inv1', amount: 100, method: 'ecocash', status: 'pending', createdById: 'parent1' });

beforeEach(() => {
  const intent: any = freshIntent();
  Object.assign(intentRepo, {
    findOne: jest.fn(async () => intent),
    save: jest.fn(async (i: any) => i),
    update: jest.fn(),
    current: intent,
  });
  queryMock = jest.fn(async () => [{ id: 'i1' }]); // atomic claim succeeds
});

describe('Paynow result handling (webhook)', () => {
  it('ignores callbacks when Paynow is not configured', async () => {
    (getPaynowConfig as jest.Mock).mockResolvedValueOnce({ enabled: false });
    expect((await applyPaynowResult({ reference: 'PYI1' })).httpStatus).toBe(200);
    expect(recordFeePayment).not.toHaveBeenCalled();
  });

  it('rejects a bad hash with 400 and posts nothing', async () => {
    const res = await applyPaynowResult({ reference: 'PYI1', status: 'Paid', hash: 'DEADBEEF' });
    expect(res.httpStatus).toBe(400);
    expect(recordFeePayment).not.toHaveBeenCalled();
  });

  it('on a verified "Paid" result: records the payment once and marks the intent paid', async () => {
    const res = await applyPaynowResult(signed({ reference: 'PYI1', paynowreference: 'PN9', amount: '100.00', status: 'Paid' }));
    expect(res).toMatchObject({ httpStatus: 200, finalised: true });
    expect(recordFeePayment).toHaveBeenCalledTimes(1);
    expect(recordFeePayment).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 's1', invoiceId: 'inv1', amount: 100, method: 'ecocash', feeType: 'tuition', recordedById: 'parent1',
    }));
    expect(intentRepo.current).toMatchObject({ status: 'paid', paymentId: 'pay1', paynowReference: 'PN9' });
  });

  it('is idempotent: a second callback that loses the claim does not double-post', async () => {
    queryMock.mockResolvedValueOnce([]); // another worker already claimed/finalised it
    const res = await applyPaynowResult(signed({ reference: 'PYI1', status: 'Paid' }));
    expect(res.finalised).toBe(true);
    expect(recordFeePayment).not.toHaveBeenCalled();
  });

  it('marks cancelled and failed results without posting', async () => {
    await applyPaynowResult(signed({ reference: 'PYI1', status: 'Cancelled' }));
    expect(intentRepo.current.status).toBe('cancelled');
    intentRepo.current.status = 'pending';
    await applyPaynowResult(signed({ reference: 'PYI1', status: 'Failed' }));
    expect(intentRepo.current.status).toBe('failed');
    expect(recordFeePayment).not.toHaveBeenCalled();
  });

  it('returns the intent to pending (for retry) if posting throws', async () => {
    (recordFeePayment as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await applyPaynowResult(signed({ reference: 'PYI1', status: 'Paid' }));
    expect(intentRepo.update).toHaveBeenCalledWith({ id: 'i1' }, expect.objectContaining({ status: 'pending' }));
    spy.mockRestore();
  });

  it('acknowledges unknown references with 200 so Paynow stops retrying', async () => {
    intentRepo.findOne.mockResolvedValueOnce(null);
    expect((await applyPaynowResult(signed({ reference: 'NOPE', status: 'Paid' }))).httpStatus).toBe(200);
    expect(recordFeePayment).not.toHaveBeenCalled();
  });
});
