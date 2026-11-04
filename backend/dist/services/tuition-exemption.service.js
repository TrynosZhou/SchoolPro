"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStaffChildExemption = isStaffChildExemption;
exports.formatExemptionLabel = formatExemptionLabel;
exports.computeTuitionExemptionDiscount = computeTuitionExemptionDiscount;
exports.getActiveExemptionForStudent = getActiveExemptionForStudent;
exports.loadActiveExemptionsMap = loadActiveExemptionsMap;
exports.searchStudentsForExemption = searchStudentsForExemption;
exports.listTuitionExemptions = listTuitionExemptions;
exports.upsertTuitionExemption = upsertTuitionExemption;
exports.removeTuitionExemption = removeTuitionExemption;
exports.buildFeeInvoiceLines = buildFeeInvoiceLines;
exports.buildTuitionInvoiceLines = buildTuitionInvoiceLines;
exports.syncTuitionExemptionToInvoices = syncTuitionExemptionToInvoices;
const data_source_1 = require("../config/data-source");
const typeorm_1 = require("typeorm");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const enums_2 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
const class_display_1 = require("../utils/class-display");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const term_balance_service_1 = require("./term-balance.service");
function isStaffChildExemption(exemption) {
    return exemption?.exemptionType === enums_2.TuitionExemptionType.STAFF_CHILD;
}
function formatExemptionLabel(type, value) {
    if (type === enums_2.TuitionExemptionType.STAFF_CHILD) {
        return 'Staff child exemption';
    }
    if (type === enums_2.TuitionExemptionType.PERCENTAGE) {
        return `Tuition exemption (${value}%)`;
    }
    return `Tuition exemption ($${value.toFixed(2)})`;
}
function staffChildDiscountLabel(feeDescription) {
    return `Staff child exemption — ${feeDescription}`;
}
function computeTuitionExemptionDiscount(baseAmount, exemption) {
    const base = (0, term_balance_service_1.roundMoney)(Math.max(0, Number(baseAmount || 0)));
    if (!exemption || base <= 0) {
        return { baseAmount: base, discountAmount: 0, netAmount: base, label: '' };
    }
    if (isStaffChildExemption(exemption)) {
        return {
            baseAmount: base,
            discountAmount: base,
            netAmount: 0,
            label: 'Staff child exemption',
        };
    }
    const value = Number(exemption.value || 0);
    let discount = 0;
    if (exemption.exemptionType === enums_2.TuitionExemptionType.PERCENTAGE) {
        const pct = Math.min(100, Math.max(0, value));
        discount = (0, term_balance_service_1.roundMoney)((base * pct) / 100);
    }
    else {
        discount = (0, term_balance_service_1.roundMoney)(Math.min(base, Math.max(0, value)));
    }
    const netAmount = (0, term_balance_service_1.roundMoney)(Math.max(0, base - discount));
    return {
        baseAmount: base,
        discountAmount: discount,
        netAmount,
        label: discount > 0 ? formatExemptionLabel(exemption.exemptionType, value) : '',
    };
}
async function getActiveExemptionForStudent(studentId) {
    return data_source_1.AppDataSource.getRepository(entities_1.TuitionExemption).findOne({
        where: { studentId, isActive: true },
    });
}
async function loadActiveExemptionsMap(studentIds) {
    const map = new Map();
    if (!studentIds.length)
        return map;
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.TuitionExemption).find({
        where: { studentId: (0, typeorm_1.In)(studentIds), isActive: true },
    });
    for (const row of rows) {
        map.set(row.studentId, row);
    }
    return map;
}
async function searchStudentsForExemption(rawQ) {
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
        c.name as "className",
        te.id IS NOT NULL as "hasExemption"
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN tuition_exemptions te ON te."studentId" = s.id AND te."isActive" = true
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
    return rows.map((r) => ({
        id: String(r.id),
        admissionNumber: String(r.admissionNumber),
        firstName: String(r.firstName),
        lastName: String(r.lastName),
        gender: (0, class_display_1.formatGenderLabel)(r.gender ? String(r.gender) : undefined),
        className: r.className ? String(r.className) : undefined,
        classLabel: (0, class_display_1.formatStudentClassLabel)(r.className ? String(r.className) : undefined),
        hasExemption: Boolean(r.hasExemption),
    }));
}
async function listTuitionExemptions() {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.TuitionExemption).find({
        where: { isActive: true },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass'),
        order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => ({
        id: row.id,
        studentId: row.studentId,
        admissionNumber: row.student?.admissionNumber || '',
        firstName: row.student?.firstName || '',
        lastName: row.student?.lastName || '',
        gender: (0, class_display_1.formatGenderLabel)(row.student?.gender),
        className: row.student?.schoolClass?.name || undefined,
        classLabel: (0, class_display_1.formatStudentClassLabel)(row.student?.schoolClass?.name),
        exemptionType: row.exemptionType,
        value: (0, term_balance_service_1.roundMoney)(Number(row.value)),
        reason: row.reason || undefined,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }));
}
function validateExemptionInput(exemptionType, value) {
    const type = String(exemptionType || '').trim();
    if (!Object.values(enums_2.TuitionExemptionType).includes(type)) {
        throw new Error('Exemption type must be percentage, amount, or staff child.');
    }
    if (type === enums_2.TuitionExemptionType.STAFF_CHILD) {
        return { exemptionType: type, value: 0 };
    }
    const num = (0, term_balance_service_1.roundMoney)(Number(value));
    if (!Number.isFinite(num) || num < 0) {
        throw new Error('Exemption value must be zero or greater.');
    }
    if (type === enums_2.TuitionExemptionType.PERCENTAGE && num > 100) {
        throw new Error('Percentage exemption cannot exceed 100%.');
    }
    return { exemptionType: type, value: num };
}
async function upsertTuitionExemption(input) {
    const student = await data_source_1.AppDataSource.getRepository(entities_1.Student).findOne({
        where: { id: input.studentId, isActive: true },
        relations: (0, typeorm_helpers_1.relations)('schoolClass'),
    });
    if (!student) {
        throw new Error('Student not found or inactive.');
    }
    const parsed = validateExemptionInput(input.exemptionType, input.value);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TuitionExemption);
    let row = await repo.findOne({ where: { studentId: input.studentId } });
    if (row) {
        row.exemptionType = parsed.exemptionType;
        row.value = parsed.value;
        row.reason = input.reason?.trim() || undefined;
        row.isActive = true;
    }
    else {
        row = repo.create({
            studentId: input.studentId,
            exemptionType: parsed.exemptionType,
            value: parsed.value,
            reason: input.reason?.trim() || undefined,
            isActive: true,
        });
    }
    const saved = await repo.save(row);
    await syncTuitionExemptionToInvoices(saved.studentId);
    return {
        id: saved.id,
        studentId: saved.studentId,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: (0, class_display_1.formatGenderLabel)(student.gender),
        className: student.schoolClass?.name || undefined,
        classLabel: (0, class_display_1.formatStudentClassLabel)(student.schoolClass?.name),
        exemptionType: saved.exemptionType,
        value: (0, term_balance_service_1.roundMoney)(Number(saved.value)),
        reason: saved.reason || undefined,
        isActive: saved.isActive,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
    };
}
async function removeTuitionExemption(id) {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.TuitionExemption);
    const row = await repo.findOne({ where: { id } });
    if (!row) {
        throw new Error('Exemption not found.');
    }
    const studentId = row.studentId;
    await repo.remove(row);
    await syncTuitionExemptionToInvoices(studentId);
}
function buildFeeInvoiceLines(feeDescription, baseAmount, exemption) {
    const base = (0, term_balance_service_1.roundMoney)(Math.max(0, Number(baseAmount || 0)));
    if (!isStaffChildExemption(exemption) || base <= 0) {
        return [{
                description: feeDescription,
                quantity: 1,
                unitPrice: base,
                amount: base,
            }];
    }
    return [
        {
            description: feeDescription,
            quantity: 1,
            unitPrice: base,
            amount: base,
        },
        {
            description: staffChildDiscountLabel(feeDescription),
            quantity: 1,
            unitPrice: -base,
            amount: -base,
        },
    ];
}
function buildTuitionInvoiceLines(tuitionFeeName, termName, baseAmount, exemption) {
    const fullLineDescription = `${tuitionFeeName} (${termName})`;
    if (isStaffChildExemption(exemption)) {
        return buildFeeInvoiceLines(fullLineDescription, baseAmount, exemption);
    }
    const { discountAmount, netAmount, label } = computeTuitionExemptionDiscount(baseAmount, exemption);
    if (discountAmount <= 0) {
        return [{
                description: fullLineDescription,
                quantity: 1,
                unitPrice: netAmount,
                amount: netAmount,
            }];
    }
    return [
        {
            description: fullLineDescription,
            quantity: 1,
            unitPrice: (0, term_balance_service_1.roundMoney)(baseAmount),
            amount: (0, term_balance_service_1.roundMoney)(baseAmount),
        },
        {
            description: label,
            quantity: 1,
            unitPrice: -discountAmount,
            amount: -discountAmount,
        },
    ];
}
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
function isExemptionLine(line) {
    const desc = String(line.description || '').toLowerCase();
    return Number(line.amount) < 0
        || desc.includes('tuition exemption')
        || desc.includes('staff child exemption');
}
function isTuitionBaseLine(line) {
    const desc = String(line.description || '').toLowerCase();
    return Number(line.amount) > 0 && desc.includes('tuition') && !desc.includes('exemption');
}
function isChargeLine(line) {
    return Number(line.amount) > 0 && !isExemptionLine(line);
}
function parseTuitionLineMeta(description) {
    const match = String(description || '').match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (match) {
        return { feeName: match[1].trim(), termName: match[2].trim() };
    }
    return { feeName: String(description || 'Tuition').trim(), termName: 'Current term' };
}
function toLineInput(line) {
    return {
        description: line.description,
        quantity: Number(line.quantity || 1),
        unitPrice: (0, term_balance_service_1.roundMoney)(Number(line.unitPrice)),
        amount: (0, term_balance_service_1.roundMoney)(Number(line.amount)),
    };
}
function rebuildInvoiceLinesWithExemption(lines, exemption) {
    if (!lines.some(isChargeLine))
        return null;
    if (isStaffChildExemption(exemption)) {
        const rebuilt = [];
        for (const charge of lines.filter(isChargeLine).map(toLineInput)) {
            rebuilt.push(...buildFeeInvoiceLines(charge.description, charge.amount, exemption));
        }
        return rebuilt;
    }
    const tuitionBaseLine = lines.find(isTuitionBaseLine);
    if (!tuitionBaseLine)
        return null;
    const nonTuitionLines = lines
        .filter((line) => !isTuitionBaseLine(line) && !isExemptionLine(line))
        .map(toLineInput);
    const { feeName, termName } = parseTuitionLineMeta(tuitionBaseLine.description);
    const baseAmount = (0, term_balance_service_1.roundMoney)(Number(tuitionBaseLine.amount));
    const tuitionLines = buildTuitionInvoiceLines(feeName, termName, baseAmount, exemption);
    return [...nonTuitionLines, ...tuitionLines];
}
function linesEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].description !== b[i].description
            || (0, term_balance_service_1.roundMoney)(a[i].amount) !== (0, term_balance_service_1.roundMoney)(b[i].amount)
            || (0, term_balance_service_1.roundMoney)(a[i].unitPrice) !== (0, term_balance_service_1.roundMoney)(b[i].unitPrice)) {
            return false;
        }
    }
    return true;
}
async function appendLedgerAdjustment(input) {
    const delta = (0, term_balance_service_1.roundMoney)(input.delta);
    if (Math.abs(delta) < 0.005)
        return;
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const lastLedger = await ledgerRepo.findOne({
        where: { studentId: input.studentId },
        order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    const isCredit = delta < 0;
    const amount = Math.abs(delta);
    let description;
    if (isCredit) {
        const label = input.exemption
            ? formatExemptionLabel(input.exemption.exemptionType, Number(input.exemption.value))
            : 'Tuition exemption';
        if (input.exemption && isStaffChildExemption(input.exemption)) {
            description = `${label} — $${amount.toFixed(2)} waived on ${input.invoiceNumber}. All fees cancelled for staff child.`;
        }
        else {
            description = `${label} — $${amount.toFixed(2)} tuition discount applied on ${input.invoiceNumber}. Gross tuition was invoiced at full amount before this exemption.`;
        }
    }
    else {
        description = input.exemption && isStaffChildExemption(input.exemption)
            ? `Staff child exemption removed — $${amount.toFixed(2)} restored to ${input.invoiceNumber}.`
            : `Tuition exemption removed or reduced — $${amount.toFixed(2)} restored to ${input.invoiceNumber}.`;
    }
    await ledgerRepo.save(ledgerRepo.create({
        studentId: input.studentId,
        termId: input.termId,
        entryDate: (0, helpers_1.today)(),
        description,
        debit: isCredit ? 0 : amount,
        credit: isCredit ? amount : 0,
        balance: (0, term_balance_service_1.roundMoney)(prevBalance + delta),
        referenceType: 'tuition_exemption',
        referenceId: input.invoiceId,
    }));
}
/** Re-apply the active tuition exemption (or remove it) on all open invoices for a student. */
async function syncTuitionExemptionToInvoices(studentId) {
    const exemption = await getActiveExemptionForStudent(studentId);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const lineRepo = data_source_1.AppDataSource.getRepository(entities_1.InvoiceLine);
    const invoices = await invoiceRepo.find({
        where: { studentId },
        relations: (0, typeorm_helpers_1.relations)('lines'),
        order: { createdAt: 'ASC' },
    });
    const affectedTermIds = new Set();
    for (const invoice of invoices) {
        if (invoice.feeType === term_balance_service_1.BALANCE_FORWARD_FEE_TYPE)
            continue;
        if (!['sent', 'partial', 'overdue'].includes(invoice.status))
            continue;
        const lines = invoice.lines || [];
        const rebuilt = rebuildInvoiceLinesWithExemption(lines, exemption);
        if (!rebuilt)
            continue;
        const oldTotal = (0, term_balance_service_1.roundMoney)(Number(invoice.totalAmount));
        const newTotal = (0, term_balance_service_1.roundMoney)(rebuilt.reduce((sum, line) => sum + Number(line.amount), 0));
        const currentInputs = lines.map(toLineInput);
        if (linesEqual(currentInputs, rebuilt) && oldTotal === newTotal)
            continue;
        await lineRepo.delete({ invoiceId: invoice.id });
        for (const line of rebuilt) {
            await lineRepo.save(lineRepo.create({
                invoiceId: invoice.id,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                amount: line.amount,
            }));
        }
        const delta = (0, term_balance_service_1.roundMoney)(newTotal - oldTotal);
        invoice.totalAmount = newTotal;
        refreshInvoiceStatus(invoice);
        await invoiceRepo.save(invoice);
        await appendLedgerAdjustment({
            studentId,
            termId: invoice.termId || undefined,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
            delta,
            exemption,
        });
        if (invoice.termId) {
            affectedTermIds.add(invoice.termId);
            await (0, term_balance_service_1.ensureTermBalanceInitialized)(studentId, invoice.termId);
        }
    }
    for (const termId of affectedTermIds) {
        await (0, term_balance_service_1.refreshTermClosingBalance)(studentId, termId);
    }
}
