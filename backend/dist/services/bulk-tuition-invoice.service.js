"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewBulkTuitionInvoices = previewBulkTuitionInvoices;
exports.createBulkTuitionInvoices = createBulkTuitionInvoices;
exports.reverseBulkTuitionInvoices = reverseBulkTuitionInvoices;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const term_balance_service_1 = require("./term-balance.service");
const registration_invoice_service_1 = require("./registration-invoice.service");
const tuition_exemption_service_1 = require("./tuition-exemption.service");
function resolveStudentForm(student) {
    if (student.form)
        return student.form;
    if (student.schoolClass?.form)
        return student.schoolClass.form;
    return null;
}
async function loadBillingTerms() {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const currentTerm = await termRepo.findOne({ where: { isCurrent: true } });
    if (!currentTerm) {
        throw new Error('No current term is set. Mark a term as current in academic settings.');
    }
    const nextTerm = await (0, term_balance_service_1.findNextTerm)(currentTerm);
    if (!nextTerm) {
        throw new Error(`No next term found after ${currentTerm.name}. Add the next term in academic settings first.`);
    }
    return { currentTerm, nextTerm };
}
async function previewBulkTuitionInvoices() {
    const { currentTerm, nextTerm } = await loadBillingTerms();
    const description = (0, registration_invoice_service_1.bulkTuitionInvoiceDescription)(currentTerm.name);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const students = await studentRepo.find({
        where: { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const existing = await invoiceRepo.find({
        where: { termId: currentTerm.id, description },
        select: { studentId: true },
    });
    const alreadyInvoiced = new Set(existing.map((inv) => inv.studentId));
    const exemptionMap = await (0, tuition_exemption_service_1.loadActiveExemptionsMap)(students.map((s) => s.id));
    let estimatedTotal = 0;
    let pendingCount = 0;
    for (const student of students) {
        if (alreadyInvoiced.has(student.id))
            continue;
        const form = resolveStudentForm(student);
        const level = form ? (0, registration_invoice_service_1.resolveFormLevel)(form) : 1;
        const tuitionFee = await (0, registration_invoice_service_1.resolveTuitionFeeForFormLevel)(level);
        const amount = Number(tuitionFee?.defaultAmount || 0);
        if (amount <= 0)
            continue;
        const { netAmount } = (0, tuition_exemption_service_1.computeTuitionExemptionDiscount)(amount, exemptionMap.get(student.id));
        estimatedTotal += netAmount;
        pendingCount += 1;
    }
    return {
        currentTerm: { id: currentTerm.id, name: currentTerm.name },
        nextTerm: { id: nextTerm.id, name: nextTerm.name },
        studentCount: students.length,
        alreadyInvoicedCount: alreadyInvoiced.size,
        pendingCount,
        estimatedTotal: Math.round(estimatedTotal * 100) / 100,
    };
}
async function createBulkTuitionInvoices() {
    const preview = await previewBulkTuitionInvoices();
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const currentTerm = await termRepo.findOne({ where: { id: preview.currentTerm.id } });
    const nextTerm = await termRepo.findOne({ where: { id: preview.nextTerm.id } });
    if (!currentTerm || !nextTerm) {
        throw new Error('Billing terms could not be loaded.');
    }
    const description = (0, registration_invoice_service_1.bulkTuitionInvoiceDescription)(currentTerm.name);
    const dueDate = nextTerm.startDate || (0, helpers_1.today)();
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const students = await studentRepo.find({
        where: { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'form'),
        order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const existing = await invoiceRepo.find({
        where: { termId: currentTerm.id, description },
        select: { studentId: true },
    });
    const alreadyInvoiced = new Set(existing.map((inv) => inv.studentId));
    const exemptionMap = await (0, tuition_exemption_service_1.loadActiveExemptionsMap)(students.map((s) => s.id));
    let created = 0;
    let skipped = 0;
    let totalBilled = 0;
    const skippedStudents = [];
    for (const student of students) {
        const studentName = `${student.firstName} ${student.lastName}`.trim();
        if (alreadyInvoiced.has(student.id)) {
            skipped += 1;
            skippedStudents.push({ id: student.id, name: studentName, reason: 'Already invoiced for this term' });
            continue;
        }
        const form = resolveStudentForm(student);
        if (!form) {
            skipped += 1;
            skippedStudents.push({ id: student.id, name: studentName, reason: 'No class or form assigned' });
            continue;
        }
        const level = (0, registration_invoice_service_1.resolveFormLevel)(form);
        const tuitionFee = await (0, registration_invoice_service_1.resolveTuitionFeeForFormLevel)(level);
        if (!tuitionFee) {
            skipped += 1;
            skippedStudents.push({ id: student.id, name: studentName, reason: 'Tuition fee not configured' });
            continue;
        }
        const amount = Math.round(Number(tuitionFee.defaultAmount) * 100) / 100;
        if (amount <= 0) {
            skipped += 1;
            skippedStudents.push({
                id: student.id,
                name: studentName,
                reason: 'Tuition fee amount is zero — set it in Manage Fees',
            });
            continue;
        }
        const exemption = exemptionMap.get(student.id);
        const invoiceLines = (0, tuition_exemption_service_1.buildTuitionInvoiceLines)(tuitionFee.name, currentTerm.name, amount, exemption);
        const invoiceTotal = (0, term_balance_service_1.roundMoney)(invoiceLines.reduce((sum, line) => sum + Number(line.amount), 0));
        let invoice = await invoiceRepo.save(invoiceRepo.create({
            invoiceNumber: (0, helpers_1.generateNumber)('INV'),
            studentId: student.id,
            termId: currentTerm.id,
            feeType: tuitionFee.code,
            description,
            totalAmount: invoiceTotal,
            amountPaid: 0,
            status: enums_1.InvoiceStatus.SENT,
            dueDate,
            issuedDate: (0, helpers_1.today)(),
        }));
        for (const line of invoiceLines) {
            await lineRepo.save(lineRepo.create({
                invoiceId: invoice.id,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                amount: line.amount,
            }));
        }
        const lastLedger = await ledgerRepo.findOne({
            where: { studentId: student.id },
            order: { createdAt: 'DESC' },
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await ledgerRepo.save(ledgerRepo.create({
            studentId: student.id,
            termId: currentTerm.id,
            entryDate: (0, helpers_1.today)(),
            description: `Invoice ${invoice.invoiceNumber} - ${description}`,
            debit: invoiceTotal,
            credit: 0,
            balance: prevBalance + invoiceTotal,
            referenceType: 'invoice',
            referenceId: invoice.id,
        }));
        await (0, term_balance_service_1.ensureTermBalanceInitialized)(student.id, currentTerm.id);
        invoice = await (0, term_balance_service_1.applyAvailablePrepaidToInvoice)(invoice);
        await (0, term_balance_service_1.refreshTermClosingBalance)(student.id, currentTerm.id);
        created += 1;
        totalBilled += invoiceTotal;
        alreadyInvoiced.add(student.id);
    }
    return {
        ...preview,
        created,
        skipped,
        skippedStudents,
        totalBilled: Math.round(totalBilled * 100) / 100,
    };
}
async function recomputeLedgerBalances(studentId) {
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const rows = await ledgerRepo.find({
        where: { studentId },
        order: { entryDate: 'ASC', createdAt: 'ASC' },
    });
    let running = 0;
    for (const row of rows) {
        running = (0, term_balance_service_1.roundMoney)(running + Number(row.debit) - Number(row.credit));
        row.balance = running;
        await ledgerRepo.save(row);
    }
}
async function reversePrepaidAppliedToInvoice(studentId, termId, prepaidApplied) {
    if (prepaidApplied <= 0.005)
        return;
    const tbRepo = data_source_1.AppDataSource.getRepository(entities_1.StudentTermBalance);
    const tb = await tbRepo.findOne({ where: { studentId, termId } });
    if (!tb)
        return;
    let remaining = (0, term_balance_service_1.roundMoney)(prepaidApplied);
    const fromOverpay = Math.min(remaining, Number(tb.overpaymentPrepaidApplied));
    tb.overpaymentPrepaidApplied = (0, term_balance_service_1.roundMoney)(Math.max(0, Number(tb.overpaymentPrepaidApplied) - fromOverpay));
    remaining = (0, term_balance_service_1.roundMoney)(remaining - fromOverpay);
    tb.prepaidApplied = (0, term_balance_service_1.roundMoney)(Math.max(0, Number(tb.prepaidApplied) - remaining));
    await tbRepo.save(tb);
}
/** Remove bulk tuition invoices for the current term and restore prior balances. */
async function reverseBulkTuitionInvoices(termName) {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const { currentTerm } = await loadBillingTerms();
    const billingTermName = termName || currentTerm.name;
    const description = (0, registration_invoice_service_1.bulkTuitionInvoiceDescription)(billingTermName);
    const invoices = await invoiceRepo.find({
        where: { termId: currentTerm.id, description },
        relations: (0, typeorm_helpers_1.relations)('lines'),
        order: { createdAt: 'ASC' },
    });
    if (!invoices.length) {
        throw new Error(`No bulk tuition invoices found with description "${description}".`);
    }
    const billingTermId = invoices[0].termId;
    const billingTerm = billingTermId
        ? await termRepo.findOne({ where: { id: billingTermId } })
        : null;
    let removed = 0;
    let skipped = 0;
    let totalReversed = 0;
    const skippedInvoices = [];
    const affectedStudents = new Set();
    for (const invoice of invoices) {
        const payments = await paymentRepo.find({ where: { invoiceId: invoice.id } });
        const paymentTotal = (0, term_balance_service_1.roundMoney)(payments.reduce((s, p) => s + Number(p.amount), 0));
        if (paymentTotal > 0.005) {
            skipped += 1;
            skippedInvoices.push({
                invoiceNumber: invoice.invoiceNumber,
                reason: `Has recorded payments ($${paymentTotal.toFixed(2)})`,
            });
            continue;
        }
        const prepaidOnInvoice = (0, term_balance_service_1.roundMoney)(Number(invoice.amountPaid));
        if (invoice.termId && prepaidOnInvoice > 0.005) {
            await reversePrepaidAppliedToInvoice(invoice.studentId, invoice.termId, prepaidOnInvoice);
        }
        await ledgerRepo.delete({ referenceType: 'invoice', referenceId: invoice.id });
        if (invoice.lines?.length) {
            await lineRepo.remove(invoice.lines);
        }
        else {
            await lineRepo.delete({ invoiceId: invoice.id });
        }
        totalReversed += (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount));
        affectedStudents.add(invoice.studentId);
        await invoiceRepo.remove(invoice);
        removed += 1;
    }
    for (const studentId of affectedStudents) {
        await recomputeLedgerBalances(studentId);
        if (billingTermId) {
            await (0, term_balance_service_1.refreshTermClosingBalance)(studentId, billingTermId);
        }
    }
    return {
        description,
        billingTermId: billingTermId || '',
        billingTermName: billingTerm?.name || 'Unknown',
        removed,
        skipped,
        skippedInvoices,
        totalReversed: (0, term_balance_service_1.roundMoney)(totalReversed),
    };
}
