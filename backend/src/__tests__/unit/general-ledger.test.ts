import { GlAccountType, GlReferenceType } from '../../entities/enums';
import { GL_ACCOUNT_CODES, postEntry, revenueAccountCodeForFeeType, roundGlMoney } from '../../services/ledger.service';

function fakeManager(accounts: any[], lastBalances: Record<string, number> = {}) {
  const saved: any[] = [];
  const entryRepo = {
    create: (d: any) => ({ ...d }),
    save: jest.fn(async (rows: any[]) => { saved.push(...rows); return rows; }),
  };
  const accountRepo = { find: jest.fn(async () => accounts) };
  const manager: any = {
    getRepository: (entity: any) => (entity?.name === 'ChartOfAccount' ? accountRepo : entryRepo),
    findOne: jest.fn(async (_e: any, opts: any) =>
      opts.where.accountId in lastBalances ? { runningBalance: lastBalances[opts.where.accountId] } : null),
  };
  return { manager, saved };
}

const cash = { id: 'cash', accountType: GlAccountType.ASSET };
const income = { id: 'inc', accountType: GlAccountType.REVENUE };
const base = { debitAccountId: 'cash', creditAccountId: 'inc', description: 'Fee', referenceType: GlReferenceType.FEE_PAYMENT, userId: 'u1' };

describe('general ledger', () => {
  it('rounds money to cents', () => {
    expect(roundGlMoney(1.005)).toBe(1.01);
    expect(roundGlMoney(10.1 + 0.2)).toBe(10.3);
  });

  it('maps fee types to revenue accounts', () => {
    expect(revenueAccountCodeForFeeType('Bus fee')).toBe(GL_ACCOUNT_CODES.TRANSPORT_INCOME);
    expect(revenueAccountCodeForFeeType('transport')).toBe(GL_ACCOUNT_CODES.TRANSPORT_INCOME);
    expect(revenueAccountCodeForFeeType('exam_fee')).toBe(GL_ACCOUNT_CODES.EXAM_INCOME);
    expect(revenueAccountCodeForFeeType('tuition_day')).toBe(GL_ACCOUNT_CODES.TUITION_INCOME);
    expect(revenueAccountCodeForFeeType('registration')).toBe(GL_ACCOUNT_CODES.TUITION_INCOME);
    expect(revenueAccountCodeForFeeType('uniform')).toBe(GL_ACCOUNT_CODES.OTHER_INCOME);
    expect(revenueAccountCodeForFeeType(undefined)).toBe(GL_ACCOUNT_CODES.OTHER_INCOME);
  });

  it('posts a balanced double entry sharing one journal batch', async () => {
    const { manager, saved } = fakeManager([cash, income]);
    const res = await postEntry({ ...base, amount: 150 }, manager);
    expect(saved).toHaveLength(2);
    const [dr, cr] = saved;
    expect(dr).toMatchObject({ accountId: 'cash', debitAmount: 150, creditAmount: 0, runningBalance: 150 });
    expect(cr).toMatchObject({ accountId: 'inc', debitAmount: 0, creditAmount: 150, runningBalance: 150 });
    expect(dr.journalBatchId).toBe(cr.journalBatchId);
    expect(res.journalBatchId).toBe(dr.journalBatchId);
  });

  it('carries running balances forward per normal-balance side', async () => {
    const { manager, saved } = fakeManager([cash, income], { cash: 500, inc: 800 });
    await postEntry({ ...base, amount: 100.5 }, manager);
    expect(saved[0].runningBalance).toBe(600.5);
    expect(saved[1].runningBalance).toBe(900.5);
  });

  it.each([
    ['zero amount', { amount: 0 }, /greater than zero/],
    ['negative amount', { amount: -5 }, /greater than zero/],
    ['same accounts', { amount: 5, creditAccountId: 'cash' }, /must be different/],
    ['no user', { amount: 5, userId: '' }, /User is required/],
    ['missing debit account', { amount: 5, debitAccountId: '' }, /accounts are required/],
  ])('rejects %s', async (_n, over, msg) => {
    const { manager } = fakeManager([cash, income]);
    await expect(postEntry({ ...base, ...(over as any) }, manager)).rejects.toThrow(msg as RegExp);
  });

  it('rejects inactive/missing accounts', async () => {
    const { manager } = fakeManager([cash]);
    await expect(postEntry({ ...base, amount: 10 }, manager)).rejects.toThrow(/missing or inactive/);
  });
});
