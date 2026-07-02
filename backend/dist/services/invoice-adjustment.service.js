"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupStudentForAdjustment = lookupStudentForAdjustment;
exports.applyCreditNote = applyCreditNote;
exports.applyDebitNote = applyDebitNote;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const term_balance_service_1 = require("./term-balance.service");
function refreshInvoiceStatus(invoice) {
    const paid = (0, term_balance_service_1.roundMoney)(Number(invoice.amountPaid));
    const total = (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount));
    if (total <= 0 || paid >= total) {
        invoice.status = enums_1.InvoiceStatus.PAID;
        return;
    }
    if (paid > 0) {
        invoice.status = enums_1.InvoiceStatus.PARTIAL;
        return;
    }
    if (invoice.status === enums_1.InvoiceStatus.OVERDUE) {
        invoice.status = enums_1.InvoiceStatus.OVERDUE;
        return;
    }
    invoice.status = enums_1.InvoiceStatus.SENT;
}
async function fetchStudentInvoiceBalance(studentId) {
    const result = await data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(GREATEST("totalAmount" - "amountPaid", 0)), 0) as owed
      FROM invoices
      WHERE "studentId" = $1
        AND status IN ('sent', 'partial', 'overdue')
    `, [studentId]);
    return (0, term_balance_service_1.roundMoney)(Math.max(0, Number(result[0]?.owed || 0)));
}
async function lookupStudentForAdjustment(rawQ) {
    const q = String(rawQ || '').trim();
    if (!q)
        return [];
    const pattern = `%${q.replace(/\s+/g, '%')}%`;
    const rows = await data_source_1.AppDataSource.query(`
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        s.gender,
        c.name as "className"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      WHERE
        s."isActive" = true
        AND (
          s.id::text = $1
          OR s."admissionNumber" ILIKE $2
          OR s."firstName" ILIKE $2
          OR s."lastName" ILIKE $2
          OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $2
        )
      ORDER BY s."lastName" ASC, s."firstName" ASC
      LIMIT 20
    `, [q, pattern]);
    const results = [];
    for (const row of rows) {
        const invoiceBalance = await fetchStudentInvoiceBalance(String(row.id));
        results.push({
            id: String(row.id),
            admissionNumber: String(row.admissionNumber),
            firstName: String(row.firstName),
            lastName: String(row.lastName),
            gender: row.gender ? String(row.gender) : undefined,
            className: row.className ? String(row.className) : undefined,
            invoiceBalance,
        });
    }
    return results;
}
async function loadOutstandingInvoices(studentId) {
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoices = await invoiceRepo.find({
        where: { studentId },
        relations: (0, typeorm_helpers_1.relations)('lines'),
        order: { dueDate: 'ASC', createdAt: 'ASC' },
    });
    return invoices.filter((inv) => {
        if (inv.feeType === term_balance_service_1.BALANCE_FORWARD_FEE_TYPE)
            return false;
        if (!['sent', 'partial', 'overdue'].includes(inv.status))
            return false;
        return (0, term_balance_service_1.roundMoney)(Number(inv.totalAmount) - Number(inv.amountPaid)) > 0;
    });
}
async function loadDebitTargetInvoice(studentId) {
    const outstanding = await loadOutstandingInvoices(studentId);
    if (outstanding.length)
        return outstanding[0];
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoices = await invoiceRepo.find({
        where: { studentId },
        relations: (0, typeorm_helpers_1.relations)('lines'),
        order: { createdAt: 'DESC' },
    });
    return (invoices.find((inv) => inv.status !== enums_1.InvoiceStatus.CANCELLED && inv.feeType !== term_balance_service_1.BALANCE_FORWARD_FEE_TYPE) || null);
}
async function appendLedgerEntry(input) {
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const lastLedger = await ledgerRepo.findOne({
        where: { studentId: input.studentId },
        order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(ledgerRepo.create({
        studentId: input.studentId,
        termId: input.termId,
        entryDate: (0, helpers_1.today)(),
        description: input.description,
        debit: (0, term_balance_service_1.roundMoney)(input.debit),
        credit: (0, term_balance_service_1.roundMoney)(input.credit),
        balance: (0, term_balance_service_1.roundMoney)(prevBalance + input.debit - input.credit),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
    }));
}
async function applyCreditNote(input) {
    const amount = (0, term_balance_service_1.roundMoney)(Number(input.amount));
    if (!input.studentId)
        throw new Error('Student is required.');
    if (amount <= 0)
        throw new Error('Credit note amount must be greater than zero.');
    const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
        where: { id: input.studentId, isActive: true },
    });
    if (!student)
        throw new Error('Student not found or inactive.');
    const balanceBefore = await fetchStudentInvoiceBalance(input.studentId);
    if (balanceBefore <= 0) {
        throw new Error('Student has no outstanding invoice balance to credit.');
    }
    if (amount > balanceBefore + 0.005) {
        throw new Error(`Credit amount cannot exceed the current invoice balance of $${balanceBefore.toFixed(2)}.`);
    }
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const adjustmentRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceAdjustment);
    const outstanding = await loadOutstandingInvoices(input.studentId);
    const noteNumber = (0, helpers_1.generateNumber)('CN');
    const reason = input.reason?.trim() || 'Credit note adjustment';
    const adjustment = await adjustmentRepo.save(adjustmentRepo.create({
        noteNumber,
        studentId: input.studentId,
        type: enums_1.InvoiceAdjustmentType.CREDIT_NOTE,
        amount,
        reason,
        recordedById: input.recordedById,
    }));
    let remaining = amount;
    const affectedInvoices = [];
    let primaryTermId;
    for (const invoice of outstanding) {
        if (remaining <= 0)
            break;
        const due = (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount) - Number(invoice.amountPaid));
        if (due <= 0)
            continue;
        const applied = (0, term_balance_service_1.roundMoney)(Math.min(due, remaining));
        invoice.totalAmount = (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount) - applied);
        refreshInvoiceStatus(invoice);
        await invoiceRepo.save(invoice);
        await lineRepo.save(lineRepo.create({
            invoiceId: invoice.id,
            description: `${noteNumber} — ${reason}`,
            quantity: 1,
            unitPrice: -applied,
            amount: -applied,
        }));
        affectedInvoices.push({ invoiceNumber: invoice.invoiceNumber, applied });
        if (!primaryTermId && invoice.termId)
            primaryTermId = invoice.termId;
        remaining = (0, term_balance_service_1.roundMoney)(remaining - applied);
        if (invoice.termId) {
            await (0, term_balance_service_1.refreshTermClosingBalance)(input.studentId, invoice.termId);
        }
    }
    await appendLedgerEntry({
        studentId: input.studentId,
        termId: primaryTermId,
        description: `Credit note ${noteNumber} — ${reason}`,
        debit: 0,
        credit: amount,
        referenceType: 'credit_note',
        referenceId: adjustment.id,
    });
    if (primaryTermId) {
        await (0, term_balance_service_1.ensureTermBalanceInitialized)(input.studentId, primaryTermId);
        await (0, term_balance_service_1.refreshTermClosingBalance)(input.studentId, primaryTermId);
    }
    const balanceAfter = await fetchStudentInvoiceBalance(input.studentId);
    return {
        noteNumber,
        type: enums_1.InvoiceAdjustmentType.CREDIT_NOTE,
        amount,
        studentId: input.studentId,
        invoiceBalanceBefore: balanceBefore,
        invoiceBalanceAfter: balanceAfter,
        affectedInvoices,
    };
}
async function applyDebitNote(input) {
    const amount = (0, term_balance_service_1.roundMoney)(Number(input.amount));
    if (!input.studentId)
        throw new Error('Student is required.');
    if (amount <= 0)
        throw new Error('Debit note amount must be greater than zero.');
    const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
        where: { id: input.studentId, isActive: true },
    });
    if (!student)
        throw new Error('Student not found or inactive.');
    const balanceBefore = await fetchStudentInvoiceBalance(input.studentId);
    const invoice = await loadDebitTargetInvoice(input.studentId);
    if (!invoice) {
        throw new Error('No invoice found for this student. Create an invoice before applying a debit note.');
    }
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const adjustmentRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceAdjustment);
    const noteNumber = (0, helpers_1.generateNumber)('DN');
    const reason = input.reason?.trim() || 'Debit note adjustment';
    const adjustment = await adjustmentRepo.save(adjustmentRepo.create({
        noteNumber,
        studentId: input.studentId,
        type: enums_1.InvoiceAdjustmentType.DEBIT_NOTE,
        amount,
        reason,
        recordedById: input.recordedById,
    }));
    invoice.totalAmount = (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount) + amount);
    refreshInvoiceStatus(invoice);
    await invoiceRepo.save(invoice);
    await lineRepo.save(lineRepo.create({
        invoiceId: invoice.id,
        description: `${noteNumber} — ${reason}`,
        quantity: 1,
        unitPrice: amount,
        amount,
    }));
    await appendLedgerEntry({
        studentId: input.studentId,
        termId: invoice.termId || undefined,
        description: `Debit note ${noteNumber} — ${reason}`,
        debit: amount,
        credit: 0,
        referenceType: 'debit_note',
        referenceId: adjustment.id,
    });
    if (invoice.termId) {
        await (0, term_balance_service_1.ensureTermBalanceInitialized)(input.studentId, invoice.termId);
        await (0, term_balance_service_1.refreshTermClosingBalance)(input.studentId, invoice.termId);
    }
    const balanceAfter = await fetchStudentInvoiceBalance(input.studentId);
    return {
        noteNumber,
        type: enums_1.InvoiceAdjustmentType.DEBIT_NOTE,
        amount,
        studentId: input.studentId,
        invoiceBalanceBefore: balanceBefore,
        invoiceBalanceAfter: balanceAfter,
        affectedInvoices: [{ invoiceNumber: invoice.invoiceNumber, applied: amount }],
    };
}
