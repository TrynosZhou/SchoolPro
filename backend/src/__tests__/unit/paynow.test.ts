import crypto from 'crypto';
import { computePaynowHash, isPaynowSuccessStatus, parseUrlEncoded, verifyPaynowHash } from '../../services/paynow.service';
import { mapPaynowMethodToPaymentMethod } from '../../services/paynow-intent.service';
import { PaymentMethod } from '../../entities/enums';

jest.mock('../../services/integrations.service', () => ({ getIntegrationsConfig: jest.fn() }));
jest.mock('../../config/data-source', () => ({ AppDataSource: {} }));
jest.mock('../../services/payment-recording.service', () => ({ recordFeePayment: jest.fn() }));

const KEY = 'integration-key';

describe('Paynow hashing', () => {
  it('is SHA512 over concatenated values + key, upper-case, ignoring "hash"', () => {
    const fields = { reference: 'PYI1', amount: '10.00', status: 'Paid', hash: 'IGNORED' };
    const expected = crypto.createHash('sha512').update(`PYI110.00Paid${KEY}`).digest('hex').toUpperCase();
    expect(computePaynowHash(fields, KEY)).toBe(expected);
  });

  it('verifies a genuine payload and rejects tampering or a missing hash', () => {
    const payload: Record<string, string> = { reference: 'PYI1', amount: '10.00', status: 'Paid' };
    payload.hash = computePaynowHash(payload, KEY);
    expect(verifyPaynowHash(payload, KEY)).toBe(true);
    expect(verifyPaynowHash({ ...payload, amount: '1.00' }, KEY)).toBe(false);
    expect(verifyPaynowHash(payload, 'other-key')).toBe(false);
    expect(verifyPaynowHash({ ...payload, hash: '' }, KEY)).toBe(false);
  });

  it('parses form-encoded bodies in order', () => {
    expect(parseUrlEncoded('status=Ok&browserurl=https%3A%2F%2Fx.y%2Fa%3Fb%3D1&msg=a+b')).toEqual({
      status: 'Ok', browserurl: 'https://x.y/a?b=1', msg: 'a b',
    });
  });

  it('recognises success statuses only', () => {
    ['Paid', 'paid', 'Awaiting Delivery', 'Delivered'].forEach((s) => expect(isPaynowSuccessStatus(s)).toBe(true));
    ['Created', 'Sent', 'Cancelled', 'Failed', '', undefined].forEach((s) => expect(isPaynowSuccessStatus(s)).toBe(false));
  });

  it('maps Paynow channels to payment methods', () => {
    expect(mapPaynowMethodToPaymentMethod('ecocash')).toBe(PaymentMethod.ECOCASH);
    expect(mapPaynowMethodToPaymentMethod('OneMoney')).toBe(PaymentMethod.ONEMONEY);
    expect(mapPaynowMethodToPaymentMethod('visa')).toBe(PaymentMethod.OTHER);
  });
});
