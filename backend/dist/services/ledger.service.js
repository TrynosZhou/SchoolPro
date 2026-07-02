"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GL_ACCOUNT_CODES = void 0;
exports.roundGlMoney = roundGlMoney;
exports.postEntry = postEntry;
exports.reverseEntry = reverseEntry;
exports.getAccountBalance = getAccountBalance;
exports.checkSystemGlBalance = checkSystemGlBalance;
exports.ensureChartOfAccountsSeeded = ensureChartOfAccountsSeeded;
exports.resolveGlAccountIdByCode = resolveGlAccountIdByCode;
exports.revenueAccountCodeForFeeType = revenueAccountCodeForFeeType;
const typeorm_1 = require("typeorm");
const crypto_1 = require("crypto");
const data_source_1 = require("../config/data-source");
const gl_accounts_1 = require("../config/gl-accounts");
Object.defineProperty(exports, "GL_ACCOUNT_CODES", { enumerable: true, get: function () { return gl_accounts_1.GL_ACCOUNT_CODES; } });
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
const EPS = 0.005;
function roundGlMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function isDebitNormal(accountType) {
    return accountType === enums_1.GlAccountType.ASSET || accountType === enums_1.GlAccountType.EXPENSE;
}
async function latestRunningBalance(manager, accountId, accountType) {
    const last = await manager.findOne(entities_1.GeneralLedgerEntry, {
        where: { accountId, isReversed: false },
        order: { transactionDate: 'DESC', createdAt: 'DESC' },
    });
    return last ? Number(last.runningBalance) : 0;
}
function nextRunningBalance(accountType, previous, debit, credit) {
    if (isDebitNormal(accountType)) {
        return roundGlMoney(previous + debit - credit);
    }
    return roundGlMoney(previous - debit + credit);
}
async function postEntry(input, manager) {
    const amount = roundGlMoney(Number(input.amount));
    if (amount <= 0)
        throw new Error('GL posting amount must be greater than zero.');
    if (!input.debitAccountId || !input.creditAccountId) {
        throw new Error('Debit and credit accounts are required.');
    }
    if (input.debitAccountId === input.creditAccountId) {
        throw new Error('Debit and credit accounts must be different.');
    }
    if (!input.userId)
        throw new Error('User is required for GL posting.');
    const run = async (tx) => {
        const accountRepo = tx.getRepository(entities_1.ChartOfAccount);
        const entryRepo = tx.getRepository(entities_1.GeneralLedgerEntry);
        const accounts = await accountRepo.find({
            where: { id: (0, typeorm_1.In)([input.debitAccountId, input.creditAccountId]), isActive: true },
        });
        const debitAccount = accounts.find((a) => a.id === input.debitAccountId);
        const creditAccount = accounts.find((a) => a.id === input.creditAccountId);
        if (!debitAccount || !creditAccount) {
            throw new Error('One or both GL accounts are missing or inactive.');
        }
        const journalBatchId = (0, crypto_1.randomUUID)();
        const transactionDate = input.transactionDate || (0, helpers_1.today)();
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
    if (manager)
        return run(manager);
    return data_source_1.AppDataSource.transaction(run);
}
async function reverseEntry(entryId, userId) {
    if (!entryId)
        throw new Error('Entry id is required.');
    if (!userId)
        throw new Error('User is required for reversal.');
    return data_source_1.AppDataSource.transaction(async (tx) => {
        const entryRepo = tx.getRepository(entities_1.GeneralLedgerEntry);
        const accountRepo = tx.getRepository(entities_1.ChartOfAccount);
        const source = await entryRepo.findOne({ where: { id: entryId } });
        if (!source)
            throw new Error('GL entry not found.');
        if (source.isReversed)
            throw new Error('GL entry has already been reversed.');
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
            where: { id: (0, typeorm_1.In)([debitLine.accountId, creditLine.accountId]) },
        });
        const debitAccount = accounts.find((a) => a.id === debitLine.accountId);
        const creditAccount = accounts.find((a) => a.id === creditLine.accountId);
        if (!debitAccount || !creditAccount)
            throw new Error('GL accounts not found for reversal.');
        const journalBatchId = (0, crypto_1.randomUUID)();
        const transactionDate = (0, helpers_1.today)();
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
        await entryRepo.update({ journalBatchId: source.journalBatchId }, { isReversed: true });
        return { journalBatchId, debitEntry: reversingDebit, creditEntry: reversingCredit };
    });
}
async function getAccountBalance(accountId) {
    const account = await data_source_1.AppDataSource.getRepository(entities_1.ChartOfAccount).findOne({ where: { id: accountId } });
    if (!account)
        throw new Error('Account not found.');
    const balance = await latestRunningBalance(data_source_1.AppDataSource.manager, accountId, account.accountType);
    return balance;
}
async function checkSystemGlBalance() {
    const [row] = await data_source_1.AppDataSource.query(`
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
async function ensureChartOfAccountsSeeded() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.ChartOfAccount);
    for (const seed of gl_accounts_1.DEFAULT_CHART_OF_ACCOUNTS) {
        const existing = await repo.findOne({ where: { accountCode: seed.accountCode } });
        if (!existing) {
            await repo.save(repo.create({ ...seed, isActive: true }));
        }
    }
}
const accountIdByCodeCache = new Map();
async function resolveGlAccountIdByCode(code) {
    const cached = accountIdByCodeCache.get(code);
    if (cached)
        return cached;
    await ensureChartOfAccountsSeeded();
    const account = await data_source_1.AppDataSource.getRepository(entities_1.ChartOfAccount).findOne({
        where: { accountCode: code, isActive: true },
    });
    if (!account)
        throw new Error(`GL account ${code} is not configured.`);
    accountIdByCodeCache.set(code, account.id);
    return account.id;
}
function revenueAccountCodeForFeeType(feeType) {
    const key = String(feeType || '').toLowerCase();
    if (key.includes('bus') || key.includes('transport'))
        return gl_accounts_1.GL_ACCOUNT_CODES.TRANSPORT_INCOME;
    if (key.includes('exam'))
        return gl_accounts_1.GL_ACCOUNT_CODES.EXAM_INCOME;
    if (key.includes('tuition') || key.includes('registration') || key.includes('desk')) {
        return gl_accounts_1.GL_ACCOUNT_CODES.TUITION_INCOME;
    }
    return gl_accounts_1.GL_ACCOUNT_CODES.OTHER_INCOME;
}
