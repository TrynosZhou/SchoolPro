import { randomUUID } from 'crypto';
import { AppDataSource } from '../../src/config/data-source';
import { GeneralLedgerEntry } from '../../src/entities';
import { GlReferenceType } from '../../src/entities/enums';
import {
  GL_ACCOUNT_CODES,
  checkSystemGlBalance,
  getAccountBalance,
  postEntry,
  resolveGlAccountIdByCode,
  revenueAccountCodeForFeeType,
  reverseEntry,
  roundGlMoney,
} from '../../src/services/ledger.service';
import { postFeePaymentToGl } from '../../src/services/gl-posting.service';
import { startTestApp, stopTestApp } from '../helpers/app';
import { findAdminUserId } from '../helpers/factories';

describe('Unit: general ledger service', () => {
  let userId: string;
  let cashAccountId: string;
  let tuitionAccountId: string;

  beforeAll(async () => {
    await startTestApp();
    userId = await findAdminUserId();
    cashAccountId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.CASH_BANK);
    tuitionAccountId = await resolveGlAccountIdByCode(GL_ACCOUNT_CODES.TUITION_INCOME);
  });

  afterAll(async () => {
    await stopTestApp();
  });

  describe('roundGlMoney', () => {
    it('rounds to two decimal places', () => {
      expect(roundGlMoney(10.005)).toBe(10.01);
      expect(roundGlMoney(10.004)).toBe(10);
      expect(roundGlMoney(0.1 + 0.2)).toBe(0.3);
    });
  });

  describe('revenueAccountCodeForFeeType', () => {
    it('maps fee types to the right revenue account', () => {
      expect(revenueAccountCodeForFeeType('tuition')).toBe(GL_ACCOUNT_CODES.TUITION_INCOME);
      expect(revenueAccountCodeForFeeType('School Bus')).toBe(GL_ACCOUNT_CODES.TRANSPORT_INCOME);
      expect(revenueAccountCodeForFeeType('exam fees')).toBe(GL_ACCOUNT_CODES.EXAM_INCOME);
      expect(revenueAccountCodeForFeeType('uniform')).toBe(GL_ACCOUNT_CODES.OTHER_INCOME);
      expect(revenueAccountCodeForFeeType(undefined)).toBe(GL_ACCOUNT_CODES.OTHER_INCOME);
    });
  });

  describe('postEntry validation', () => {
    it('refuses a non-positive amount', async () => {
      await expect(
        postEntry({
          debitAccountId: cashAccountId,
          creditAccountId: tuitionAccountId,
          amount: 0,
          description: 'bad',
          referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
          userId,
        }),
      ).rejects.toThrow(/greater than zero/i);
    });

    it('refuses the same account on both sides', async () => {
      await expect(
        postEntry({
          debitAccountId: cashAccountId,
          creditAccountId: cashAccountId,
          amount: 10,
          description: 'bad',
          referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
          userId,
        }),
      ).rejects.toThrow(/must be different/i);
    });

    it('refuses a posting with no author', async () => {
      await expect(
        postEntry({
          debitAccountId: cashAccountId,
          creditAccountId: tuitionAccountId,
          amount: 10,
          description: 'bad',
          referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
          userId: '',
        }),
      ).rejects.toThrow(/user is required/i);
    });

    it('refuses an unknown account id', async () => {
      await expect(
        postEntry({
          debitAccountId: randomUUID(),
          creditAccountId: tuitionAccountId,
          amount: 10,
          description: 'bad',
          referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
          userId,
        }),
      ).rejects.toThrow(/missing or inactive/i);
    });
  });

  describe('postEntry', () => {
    it('writes a balanced debit/credit pair and advances both running balances', async () => {
      const cashBefore = await getAccountBalance(cashAccountId);
      const tuitionBefore = await getAccountBalance(tuitionAccountId);

      const result = await postEntry({
        debitAccountId: cashAccountId,
        creditAccountId: tuitionAccountId,
        amount: 250.5,
        description: 'Test journal',
        referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
        referenceId: randomUUID(),
        userId,
      });

      expect(result.journalBatchId).toBeTruthy();
      expect(roundGlMoney(Number(result.debitEntry.debitAmount))).toBe(250.5);
      expect(roundGlMoney(Number(result.debitEntry.creditAmount))).toBe(0);
      expect(roundGlMoney(Number(result.creditEntry.creditAmount))).toBe(250.5);
      expect(roundGlMoney(Number(result.creditEntry.debitAmount))).toBe(0);
      expect(result.debitEntry.journalBatchId).toBe(result.journalBatchId);
      expect(result.creditEntry.journalBatchId).toBe(result.journalBatchId);

      // Cash is an asset (debit-normal) so it grows; income is credit-normal so it also grows.
      expect(await getAccountBalance(cashAccountId)).toBe(roundGlMoney(cashBefore + 250.5));
      expect(await getAccountBalance(tuitionAccountId)).toBe(roundGlMoney(tuitionBefore + 250.5));
    });

    it('leaves the whole ledger balanced', async () => {
      const balance = await checkSystemGlBalance();
      expect(balance.balanced).toBe(true);
      expect(balance.variance).toBe(0);
    });
  });

  describe('reverseEntry', () => {
    it('posts a mirror entry and flags the original batch as reversed', async () => {
      const cashBefore = await getAccountBalance(cashAccountId);

      const posted = await postEntry({
        debitAccountId: cashAccountId,
        creditAccountId: tuitionAccountId,
        amount: 40,
        description: 'To be reversed',
        referenceType: GlReferenceType.MANUAL_ADJUSTMENT,
        referenceId: randomUUID(),
        userId,
      });
      expect(await getAccountBalance(cashAccountId)).toBe(roundGlMoney(cashBefore + 40));

      await reverseEntry(posted.debitEntry.id, userId);
      expect(await getAccountBalance(cashAccountId)).toBe(cashBefore);

      const original = await AppDataSource.getRepository(GeneralLedgerEntry).findOne({
        where: { id: posted.debitEntry.id },
      });
      expect(original!.isReversed).toBe(true);

      await expect(reverseEntry(posted.debitEntry.id, userId)).rejects.toThrow(/already been reversed/i);

      const balance = await checkSystemGlBalance();
      expect(balance.balanced).toBe(true);
    });
  });

  describe('postFeePaymentToGl', () => {
    it('is idempotent for a given payment id', async () => {
      const paymentId = randomUUID();
      const fakePayment = {
        id: paymentId,
        amount: 75,
        feeType: 'tuition',
        label: 'Term fees',
        paymentReference: `PAY-TEST-${paymentId.slice(0, 6)}`,
        paidAt: new Date(),
      } as never;

      const manager = AppDataSource.manager;
      await postFeePaymentToGl(manager, fakePayment, userId);
      await postFeePaymentToGl(manager, fakePayment, userId);

      const entries = await AppDataSource.getRepository(GeneralLedgerEntry).find({
        where: { referenceType: GlReferenceType.FEE_PAYMENT, referenceId: paymentId },
      });
      // One debit + one credit, and the second call must not post again.
      expect(entries.length).toBe(2);
    });

    it('does nothing for a zero-value payment', async () => {
      const paymentId = randomUUID();
      await postFeePaymentToGl(
        AppDataSource.manager,
        { id: paymentId, amount: 0, feeType: 'tuition', label: 'x', paidAt: new Date() } as never,
        userId,
      );
      const entries = await AppDataSource.getRepository(GeneralLedgerEntry).find({
        where: { referenceId: paymentId },
      });
      expect(entries.length).toBe(0);
    });
  });
});
