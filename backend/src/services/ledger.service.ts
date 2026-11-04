import { EntityManager, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/data-source';
import { DEFAULT_CHART_OF_ACCOUNTS, GL_ACCOUNT_CODES } from '../config/gl-accounts';
import { tenantContext } from '../config/tenant-context';
import { ChartOfAccount, GeneralLedgerEntry } from '../entities';
import { GlAccountType, GlReferenceType } from '../entities/enums';
import { today } from '../utils/helpers';

const EPS = 0.005;

export function roundGlMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isDebitNormal(accountType: GlAccountType): boolean {
  return accountType === GlAccountType.ASSET || accountType === GlAccountType.EXPENSE;
}

async function latestRunningBalance(
  manager: EntityManager,
  accountId: string,
  accountType: GlAccountType,
): Promise<number> {
  const last = await manager.findOne(GeneralLedgerEntry, {
    where: { accountId, isReversed: false },
    order: { transactionDate: 'DESC', createdAt: 'DESC' },
  });
  return last ? Number(last.runningBalance) : 0;
}

function nextRunningBalance(
  accountType: GlAccountType,
  previous: number,
  debit: number,
  credit: number,
): number {
  if (isDebitNormal(accountType)) {
    return roundGlMoney(previous + debit - credit);
  }
  return roundGlMoney(previous - debit + credit);
}

export interface PostEntryInput {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description: string;
  referenceType: GlReferenceType;
  referenceId?: string;
  userId: string;
  transactionDate?: string;
}

export interface PostEntryResult {
  journalBatchId: string;
  debitEntry: GeneralLedgerEntry;
  creditEntry: GeneralLedgerEntry;
}

export async function postEntry(
  input: PostEntryInput,
  manager?: EntityManager,
): Promise<PostEntryResult> {
  const amount = roundGlMoney(Number(input.amount));
  if (amount <= 0) throw new Error('GL posting amount must be greater than zero.');
  if (!input.debitAccountId || !input.creditAccountId) {
    throw new Error('Debit and credit accounts are required.');
  }
  if (input.debitAccountId === input.creditAccountId) {
    throw new Error('Debit and credit accounts must be different.');
  }
  if (!input.userId) throw new Error('User is required for GL posting.');

  const run = async (tx: EntityManager) => {
    const accountRepo = tx.getRepository(ChartOfAccount);
    const entryRepo = tx.getRepository(GeneralLedgerEntry);
    const accounts = await accountRepo.find({
      where: { id: In([input.debitAccountId, input.creditAccountId]), isActive: true },
    });
    const debitAccount = accounts.find((a) => a.id === input.debitAccountId);
    const creditAccount = accounts.find((a) => a.id === input.creditAccountId);
    if (!debitAccount || !creditAccount) {
      throw new Error('One or both GL accounts are missing or inactive.');
    }

    const journalBatchId = randomUUID();
    const transactionDate = input.transactionDate || today();
    const referenceId = input.referenceId || journalBatchId;

    const debitPrev = await latestRunningBalance(tx, debitAccount.id, debitAccount.accountType);
    const creditPrev = await latestRunningBalance(tx, creditAccount.id, creditAccount.accountType);

    const debitEntry = entryRepo.create({
      transactionDate,
      accountId: debitAccount.id,
      debitAmount: amount,
      creditAmount: 0,
      description: input.description,
      referenceType: input.referenceType,
      referenceId,
      journalBatchId,
      runningBalance: nextRunningBalance(debitAccount.accountType, debitPrev, amount, 0),
      createdById: input.userId,
      isReversed: false,
    });

    const creditEntry = entryRepo.create({
      transactionDate,
      accountId: creditAccount.id,
      debitAmount: 0,
      creditAmount: amount,
      description: input.description,
      referenceType: input.referenceType,
      referenceId,
      journalBatchId,
      runningBalance: nextRunningBalance(creditAccount.accountType, creditPrev, 0, amount),
      createdById: input.userId,
      isReversed: false,
    });

    await entryRepo.save([debitEntry, creditEntry]);

    const postedDebit = roundGlMoney(Number(debitEntry.debitAmount));
    const postedCredit = roundGlMoney(Number(creditEntry.creditAmount));
    if (postedDebit !== amount || postedCredit !== amount) {
      throw new Error('GL posting failed debit/credit integrity check.');
    }

    return { journalBatchId, debitEntry, creditEntry };
  };

  if (manager) return run(manager);
  return AppDataSource.transaction(run);
}

export async function reverseEntry(entryId: string, userId: string): Promise<PostEntryResult> {
  if (!entryId) throw new Error('Entry id is required.');
  if (!userId) throw new Error('User is required for reversal.');

  return AppDataSource.transaction(async (tx) => {
    const entryRepo = tx.getRepository(GeneralLedgerEntry);
    const accountRepo = tx.getRepository(ChartOfAccount);

    const source = await entryRepo.findOne({ where: { id: entryId } });
    if (!source) throw new Error('GL entry not found.');
    if (source.isReversed) throw new Error('GL entry has already been reversed.');

    const batchEntries = await entryRepo.find({
      where: { journalBatchId: source.journalBatchId, isReversed: false },
      order: { createdAt: 'ASC' },
    });
    if (batchEntries.length !== 2) {
      throw new Error('Expected a paired journal batch to reverse.');
    }

    const [first, second] = batchEntries;
    const debitLine = Number(first.debitAmount) > 0 ? first : second;
    const creditLine = Number(first.creditAmount) > 0 ? first : second;
    const amount = roundGlMoney(Number(debitLine.debitAmount));
    if (amount <= 0 || roundGlMoney(Number(creditLine.creditAmount)) !== amount) {
      throw new Error('Journal batch is not balanced.');
    }

    const accounts = await accountRepo.find({
      where: { id: In([debitLine.accountId, creditLine.accountId]) },
    });
    const debitAccount = accounts.find((a) => a.id === debitLine.accountId);
    const creditAccount = accounts.find((a) => a.id === creditLine.accountId);
    if (!debitAccount || !creditAccount) throw new Error('GL accounts not found for reversal.');

    const journalBatchId = randomUUID();
    const transactionDate = today();
    const description = `Reversal of ${source.description}`;

    const debitPrev = await latestRunningBalance(tx, creditAccount.id, creditAccount.accountType);
    const creditPrev = await latestRunningBalance(tx, debitAccount.id, debitAccount.accountType);

    const reversingDebit = entryRepo.create({
      transactionDate,
      accountId: creditAccount.id,
      debitAmount: amount,
      creditAmount: 0,
      description,
      referenceType: source.referenceType,
      referenceId: source.referenceId,
      journalBatchId,
      runningBalance: nextRunningBalance(creditAccount.accountType, debitPrev, amount, 0),
      createdById: userId,
      isReversed: false,
      reversalOfEntryId: creditLine.id,
    });

    const reversingCredit = entryRepo.create({
      transactionDate,
      accountId: debitAccount.id,
      debitAmount: 0,
      creditAmount: amount,
      description,
      referenceType: source.referenceType,
      referenceId: source.referenceId,
      journalBatchId,
      runningBalance: nextRunningBalance(debitAccount.accountType, creditPrev, 0, amount),
      createdById: userId,
      isReversed: false,
      reversalOfEntryId: debitLine.id,
    });

    await entryRepo.save([reversingDebit, reversingCredit]);
    await entryRepo.update(
      { journalBatchId: source.journalBatchId },
      { isReversed: true },
    );

    return { journalBatchId, debitEntry: reversingDebit, creditEntry: reversingCredit };
  });
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const account = await AppDataSource.getRepository(ChartOfAccount).findOne({ where: { id: accountId } });
  if (!account) throw new Error('Account not found.');
  const balance = await latestRunningBalance(
    AppDataSource.manager,
    accountId,
    account.accountType,
  );
  return balance;
}

export async function checkSystemGlBalance(): Promise<{
  balanced: boolean;
  totalDebits: number;
  totalCredits: number;
  variance: number;
}> {
  const [row] = await AppDataSource.query(`
    SELECT
      COALESCE(SUM("debitAmount"), 0) as debits,
      COALESCE(SUM("creditAmount"), 0) as credits
    FROM general_ledger_entries
    WHERE "isReversed" = false
  `);
  const totalDebits = roundGlMoney(Number(row?.debits || 0));
  const totalCredits = roundGlMoney(Number(row?.credits || 0));
  const variance = roundGlMoney(totalDebits - totalCredits);
  return {
    balanced: Math.abs(variance) <= EPS,
    totalDebits,
    totalCredits,
    variance,
  };
}

export async function ensureChartOfAccountsSeeded(): Promise<void> {
  const repo = AppDataSource.getRepository(ChartOfAccount);
  for (const seed of DEFAULT_CHART_OF_ACCOUNTS) {
    const existing = await repo.findOne({ where: { accountCode: seed.accountCode } });
    if (!existing) {
      await repo.save(repo.create({ ...seed, isActive: true }));
    }
  }
}

// Account IDs are DB-generated and differ between the production and demo
// databases, so the cache key must include the tenant to avoid resolving a
// prod account ID while running against the demo DataSource (or vice versa).
const accountIdByCodeCache = new Map<string, string>();

function accountCacheKey(code: string): string {
  return `${tenantContext.isDemo() ? 'demo' : 'prod'}:${code}`;
}

export async function resolveGlAccountIdByCode(code: string): Promise<string> {
  const key = accountCacheKey(code);
  const cached = accountIdByCodeCache.get(key);
  if (cached) return cached;
  await ensureChartOfAccountsSeeded();
  const account = await AppDataSource.getRepository(ChartOfAccount).findOne({
    where: { accountCode: code, isActive: true },
  });
  if (!account) throw new Error(`GL account ${code} is not configured.`);
  accountIdByCodeCache.set(key, account.id);
  return account.id;
}

export function revenueAccountCodeForFeeType(feeType?: string): string {
  const key = String(feeType || '').toLowerCase();
  if (key.includes('bus') || key.includes('transport')) return GL_ACCOUNT_CODES.TRANSPORT_INCOME;
  if (key.includes('exam')) return GL_ACCOUNT_CODES.EXAM_INCOME;
  if (key.includes('tuition') || key.includes('registration') || key.includes('desk')) {
    return GL_ACCOUNT_CODES.TUITION_INCOME;
  }
  return GL_ACCOUNT_CODES.OTHER_INCOME;
}

export { GL_ACCOUNT_CODES };
