"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BALANCE_FORWARD_FEE_TYPE = void 0;
exports.roundMoney = roundMoney;
exports.findPreviousTerm = findPreviousTerm;
exports.findNextTerm = findNextTerm;
exports.getAvailablePrepaidCredit = getAvailablePrepaidCredit;
exports.computeTermNetBalance = computeTermNetBalance;
exports.ensureTermBalanceInitialized = ensureTermBalanceInitialized;
exports.applyAvailablePrepaidToInvoice = applyAvailablePrepaidToInvoice;
exports.recordOverpaymentPrepaid = recordOverpaymentPrepaid;
exports.refreshTermClosingBalance = refreshTermClosingBalance;
exports.carryForwardBalancesForTerm = carryForwardBalancesForTerm;
exports.getTermBalanceSummary = getTermBalanceSummary;
exports.resolvePaymentTermId = resolvePaymentTermId;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_1 = require("typeorm");
const helpers_1 = require("../utils/helpers");
exports.BALANCE_FORWARD_FEE_TYPE = 'balance_forward';
const EPS = 0.005;
function roundMoney(value) {
    return Math.round(value * 100) / 100;
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
async function findPreviousTerm(term) {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    if (term.termNumber > 1) {
        const priorInYear = await termRepo.find({
            where: { schoolYearId: term.schoolYearId, termNumber: term.termNumber - 1 },
            order: { isCurrent: 'DESC', createdAt: 'DESC' },
            take: 1,
        });
        if (priorInYear[0])
            return priorInYear[0];
    }
    const rows = await data_source_1.AppDataSource.query(`
      SELECT t.*
      FROM terms t
      INNER JOIN school_years y ON y.id = t."schoolYearId"
      WHERE y."startDate" < (
        SELECT y2."startDate" FROM school_years y2 WHERE y2.id = $1
      )
      ORDER BY y."startDate" DESC, t."termNumber" DESC
      LIMIT 1
    `, [term.schoolYearId]);
    return rows[0] || null;
}
async function findNextTerm(term) {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const nextInYear = await termRepo.find({
        where: { schoolYearId: term.schoolYearId, termNumber: term.termNumber + 1 },
        order: { isCurrent: 'DESC', createdAt: 'DESC' },
        take: 1,
    });
    if (nextInYear[0])
        return nextInYear[0];
    const rows = await data_source_1.AppDataSource.query(`
      SELECT t.*
      FROM terms t
      INNER JOIN school_years y ON y.id = t."schoolYearId"
      WHERE y."startDate" > (
        SELECT y2."startDate" FROM school_years y2 WHERE y2.id = $1
      )
      ORDER BY y."startDate" ASC, t."termNumber" ASC
      LIMIT 1
    `, [term.schoolYearId]);
    return rows[0] || null;
}
async function getAvailablePrepaidCredit(tb) {
    const openingCredit = Number(tb.openingBalance) < 0
        ? Math.max(0, Math.abs(Number(tb.openingBalance)) - Number(tb.prepaidApplied))
        : 0;
    const overpayCredit = Math.max(0, Number(tb.overpaymentPrepaid) - Number(tb.overpaymentPrepaidApplied));
    return roundMoney(openingCredit + overpayCredit);
}
/** Net invoice balance for a term: positive = owes, negative = prepaid credit remaining. */
async function computeTermNetBalance(studentId, termId) {
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const invoices = await invoiceRepo.find({ where: { studentId, termId } });
    const invoiceDue = roundMoney(invoices.reduce((sum, inv) => sum + Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid)), 0));
    const tb = await tbRepo.findOne({ where: { studentId, termId } });
    if (!tb)
        return invoiceDue;
    const prepaidAvailable = await getAvailablePrepaidCredit(tb);
    return roundMoney(invoiceDue - prepaidAvailable);
}
/** Close prior-term fee invoices once their balance is represented by a carry-forward row. */
async function supersedePriorTermInvoicesForCarryForward(studentId, prevTermId) {
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoices = await invoiceRepo.find({
        where: {
            studentId,
            termId: prevTermId,
            feeType: (0, typeorm_1.Not)(exports.BALANCE_FORWARD_FEE_TYPE),
        },
    });
    for (const inv of invoices) {
        if (inv.status === enums_1.InvoiceStatus.CANCELLED || inv.status === enums_1.InvoiceStatus.DRAFT)
            continue;
        const remaining = roundMoney(Number(inv.totalAmount) - Number(inv.amountPaid));
        if (remaining <= EPS && inv.status === enums_1.InvoiceStatus.PAID)
            continue;
        inv.amountPaid = Number(inv.totalAmount);
        inv.status = enums_1.InvoiceStatus.PAID;
        await invoiceRepo.save(inv);
    }
}
async function removeDuplicateCarryForwardInvoice(invoice) {
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    await data_source_1.AppDataSource.query(`UPDATE payments SET "invoiceId" = NULL WHERE "invoiceId" = $1`, [invoice.id]);
    await ledgerRepo.delete({ referenceType: 'invoice', referenceId: invoice.id });
    await lineRepo.delete({ invoiceId: invoice.id });
    await tbRepo.update({ carryForwardInvoiceId: invoice.id }, { carryForwardInvoiceId: null });
    await invoiceRepo.remove(invoice);
}
async function syncCarryForwardInvoice(studentId, termId, term, openingArrears, tb) {
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const prevTerm = await findPreviousTerm(term);
    const prevLabel = prevTerm?.name || 'previous term';
    const description = (0, helpers_1.invoiceDescriptionWithTerm)(`Balance brought forward from ${prevLabel}`, term.name);
    const amount = roundMoney(openingArrears);
    const matchingCarryForwards = await invoiceRepo.find({
        where: { studentId, feeType: exports.BALANCE_FORWARD_FEE_TYPE, description },
        order: { createdAt: 'ASC' },
    });
    let invoice = tb.carryForwardInvoiceId
        ? matchingCarryForwards.find((inv) => inv.id === tb.carryForwardInvoiceId) ?? null
        : null;
    if (!invoice) {
        invoice = matchingCarryForwards.find((inv) => inv.termId === termId) ?? null;
    }
    if (!invoice && matchingCarryForwards.length) {
        invoice = matchingCarryForwards[0];
        if (invoice.termId !== termId) {
            invoice.termId = termId;
        }
    }
    for (const duplicate of matchingCarryForwards) {
        if (invoice && duplicate.id !== invoice.id) {
            await removeDuplicateCarryForwardInvoice(duplicate);
        }
    }
    if (invoice) {
        const prevTotal = Number(invoice.totalAmount);
        invoice.totalAmount = amount;
        invoice.description = description;
        invoice.dueDate = term.startDate;
        invoice.issuedDate = term.startDate;
        if (Number(invoice.amountPaid) > amount) {
            invoice.amountPaid = amount;
        }
        invoice.status =
            Number(invoice.amountPaid) >= amount
                ? enums_1.InvoiceStatus.PAID
                : Number(invoice.amountPaid) > 0
                    ? enums_1.InvoiceStatus.PARTIAL
                    : enums_1.InvoiceStatus.SENT;
        await invoiceRepo.save(invoice);
        if (Math.abs(prevTotal - amount) > EPS) {
            const lastLedger = await ledgerRepo.findOne({
                where: { studentId, referenceType: 'invoice', referenceId: invoice.id },
                order: { createdAt: 'DESC' },
            });
            if (lastLedger) {
                const delta = amount - prevTotal;
                const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
                await ledgerRepo.save(ledgerRepo.create({
                    studentId,
                    termId,
                    entryDate: today(),
                    description: `Carry-forward adjustment — ${invoice.invoiceNumber}`,
                    debit: delta > 0 ? delta : 0,
                    credit: delta < 0 ? Math.abs(delta) : 0,
                    balance: prevBalance + delta,
                    referenceType: 'invoice',
                    referenceId: invoice.id,
                }));
            }
        }
    }
    else {
        invoice = await invoiceRepo.save(invoiceRepo.create({
            invoiceNumber: (0, helpers_1.generateNumber)('INV'),
            studentId,
            termId,
            feeType: exports.BALANCE_FORWARD_FEE_TYPE,
            description,
            totalAmount: amount,
            amountPaid: 0,
            status: enums_1.InvoiceStatus.SENT,
            dueDate: term.startDate,
            issuedDate: term.startDate,
        }));
        const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
        await lineRepo.save(lineRepo.create({
            invoiceId: invoice.id,
            description,
            quantity: 1,
            unitPrice: amount,
            amount,
        }));
        const lastLedger = await ledgerRepo.findOne({
            where: { studentId },
            order: { createdAt: 'DESC' },
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await ledgerRepo.save(ledgerRepo.create({
            studentId,
            termId,
            entryDate: today(),
            description: `Invoice ${invoice.invoiceNumber} - ${description}`,
            debit: amount,
            credit: 0,
            balance: prevBalance + amount,
            referenceType: 'invoice',
            referenceId: invoice.id,
        }));
    }
    tb.carryForwardInvoiceId = invoice.id;
    if (prevTerm && amount > EPS) {
        await supersedePriorTermInvoicesForCarryForward(studentId, prevTerm.id);
    }
}
async function ensureTermBalanceInitialized(studentId, termId) {
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    let tb = await tbRepo.findOne({ where: { studentId, termId } });
    if (tb?.initialized) {
        tb.closingBalance = await computeTermNetBalance(studentId, termId);
        return tbRepo.save(tb);
    }
    const term = await termRepo.findOne({ where: { id: termId } });
    if (!term)
        throw new Error('Term not found');
    const prevTerm = await findPreviousTerm(term);
    let openingBalance = 0;
    if (prevTerm) {
        await ensureTermBalanceInitialized(studentId, prevTerm.id);
        openingBalance = await computeTermNetBalance(studentId, prevTerm.id);
    }
    if (!tb) {
        tb = tbRepo.create({
            studentId,
            termId,
            openingBalance,
            prepaidApplied: 0,
            overpaymentPrepaid: 0,
            overpaymentPrepaidApplied: 0,
            initialized: false,
        });
    }
    else {
        tb.openingBalance = openingBalance;
    }
    if (openingBalance > EPS) {
        await syncCarryForwardInvoice(studentId, termId, term, openingBalance, tb);
    }
    else if (tb.carryForwardInvoiceId) {
        const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
        const existing = await invoiceRepo.findOne({ where: { id: tb.carryForwardInvoiceId } });
        if (existing && Number(existing.amountPaid) <= EPS) {
            await invoiceRepo.remove(existing);
            tb.carryForwardInvoiceId = null;
        }
    }
    tb.initialized = true;
    tb.closingBalance = await computeTermNetBalance(studentId, termId);
    return tbRepo.save(tb);
}
async function applyAvailablePrepaidToInvoice(invoice) {
    if (!invoice.termId || invoice.feeType === exports.BALANCE_FORWARD_FEE_TYPE)
        return invoice;
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const tb = await ensureTermBalanceInitialized(invoice.studentId, invoice.termId);
    let available = await getAvailablePrepaidCredit(tb);
    if (available <= EPS)
        return invoice;
    const due = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid));
    const apply = roundMoney(Math.min(available, due));
    if (apply <= EPS)
        return invoice;
    invoice.amountPaid = roundMoney(Number(invoice.amountPaid) + apply);
    invoice.status =
        Number(invoice.amountPaid) >= Number(invoice.totalAmount)
            ? enums_1.InvoiceStatus.PAID
            : enums_1.InvoiceStatus.PARTIAL;
    let remaining = apply;
    const openingCreditRemaining = Math.max(0, (Number(tb.openingBalance) < 0 ? Math.abs(Number(tb.openingBalance)) : 0) - Number(tb.prepaidApplied));
    const fromOpening = Math.min(remaining, openingCreditRemaining);
    tb.prepaidApplied = roundMoney(Number(tb.prepaidApplied) + fromOpening);
    remaining = roundMoney(remaining - fromOpening);
    if (remaining > EPS) {
        tb.overpaymentPrepaidApplied = roundMoney(Number(tb.overpaymentPrepaidApplied) + remaining);
    }
    tb.closingBalance = await computeTermNetBalance(invoice.studentId, invoice.termId);
    await tbRepo.save(tb);
    return invoiceRepo.save(invoice);
}
async function recordOverpaymentPrepaid(studentId, termId, amount) {
    const credit = roundMoney(amount);
    if (credit <= EPS)
        return;
    const resolvedTermId = termId || (await resolveCurrentTermId());
    if (!resolvedTermId)
        return;
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const tb = await ensureTermBalanceInitialized(studentId, resolvedTermId);
    tb.overpaymentPrepaid = roundMoney(Number(tb.overpaymentPrepaid) + credit);
    tb.closingBalance = await computeTermNetBalance(studentId, resolvedTermId);
    await tbRepo.save(tb);
}
async function resolveCurrentTermId() {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const current = await termRepo.findOne({ where: { isCurrent: true } });
    return current?.id;
}
async function refreshTermClosingBalance(studentId, termId) {
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const tb = await ensureTermBalanceInitialized(studentId, termId);
    const closing = await computeTermNetBalance(studentId, termId);
    tb.closingBalance = closing;
    await tbRepo.save(tb);
    return closing;
}
async function carryForwardBalancesForTerm(termId) {
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const students = await studentRepo.find({ where: { isActive: true } });
    for (const student of students) {
        await ensureTermBalanceInitialized(student.id, termId);
    }
    return { studentsProcessed: students.length };
}
async function getTermBalanceSummary(studentId, termId) {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const tb = await ensureTermBalanceInitialized(studentId, termId);
    const term = await termRepo.findOne({ where: { id: termId } });
    const prevTerm = term ? await findPreviousTerm(term) : null;
    const prepaidAvailable = await getAvailablePrepaidCredit(tb);
    const netBalance = await computeTermNetBalance(studentId, termId);
    return {
        termId,
        termName: term?.name,
        previousTermName: prevTerm?.name,
        openingBalance: Number(tb.openingBalance),
        prepaidApplied: Number(tb.prepaidApplied),
        overpaymentPrepaid: Number(tb.overpaymentPrepaid),
        overpaymentPrepaidApplied: Number(tb.overpaymentPrepaidApplied),
        prepaidCreditAvailable: prepaidAvailable,
        closingBalance: netBalance,
        carryForwardInvoiceId: tb.carryForwardInvoiceId,
    };
}
async function resolvePaymentTermId(studentId, invoiceId) {
    if (invoiceId) {
        const invoice = await data_source_1.AppDataSource.getRepository(entities_1.Invoice).findOne({ where: { id: invoiceId, studentId } });
        if (invoice?.termId)
            return invoice.termId;
    }
    return resolveCurrentTermId();
}
