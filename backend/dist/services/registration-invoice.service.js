"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRATION_FEE_DEFINITIONS = exports.REGISTRATION_FEE_CODES = void 0;
exports.ensureRegistrationSchoolFees = ensureRegistrationSchoolFees;
exports.resolveFormLevel = resolveFormLevel;
exports.tuitionFeeCodeForFormLevel = tuitionFeeCodeForFormLevel;
exports.getCurrentTermId = getCurrentTermId;
exports.resolveTuitionFeeForFormLevel = resolveTuitionFeeForFormLevel;
exports.bulkTuitionInvoiceDescription = bulkTuitionInvoiceDescription;
exports.createRegistrationInvoiceForStudent = createRegistrationInvoiceForStudent;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const helpers_1 = require("../utils/helpers");
const pdf_1 = require("../utils/pdf");
const term_balance_service_1 = require("./term-balance.service");
const fee_catalog_service_1 = require("./fee-catalog.service");
const school_branding_service_1 = require("./school-branding.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
exports.REGISTRATION_FEE_CODES = {
    desk: 'desk_fee',
    registration: 'registration_fee',
    tuitionOrdinary: 'ordinary_level_tuition',
    tuitionAdvanced: 'advanced_level_tuition',
};
exports.REGISTRATION_FEE_DEFINITIONS = [
    {
        code: exports.REGISTRATION_FEE_CODES.desk,
        name: 'Desk Fee',
        icon: '🪑',
        sortOrder: 10,
        defaultAmount: 0,
        isActive: true,
    },
    {
        code: exports.REGISTRATION_FEE_CODES.registration,
        name: 'Registration Fee',
        icon: '📝',
        sortOrder: 11,
        defaultAmount: 0,
        isActive: true,
    },
    {
        code: exports.REGISTRATION_FEE_CODES.tuitionOrdinary,
        name: 'Ordinary Level Tuition',
        icon: '📚',
        sortOrder: 12,
        defaultAmount: 0,
        isActive: true,
    },
    {
        code: exports.REGISTRATION_FEE_CODES.tuitionAdvanced,
        name: 'Advanced Level Tuition',
        icon: '🎓',
        sortOrder: 13,
        defaultAmount: 0,
        isActive: true,
    },
];
async function ensureRegistrationSchoolFees() {
    await (0, fee_catalog_service_1.ensureDefaultSchoolFees)();
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    for (const def of exports.REGISTRATION_FEE_DEFINITIONS) {
        const existing = await repo.findOne({ where: { code: def.code } });
        if (!existing) {
            await repo.save(repo.create(def));
        }
    }
}
function resolveFormLevel(form) {
    if (form.level >= 1 && form.level <= 6)
        return form.level;
    const match = form.name.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
}
function tuitionFeeCodeForFormLevel(level) {
    return level >= 5
        ? exports.REGISTRATION_FEE_CODES.tuitionAdvanced
        : exports.REGISTRATION_FEE_CODES.tuitionOrdinary;
}
async function getCurrentTermId() {
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({
        where: { isCurrent: true },
    });
    return term?.id;
}
/** Resolve the tuition fee catalog row for a student's form level (O-Level vs A-Level). */
async function resolveTuitionFeeForFormLevel(level) {
    await ensureRegistrationSchoolFees();
    const feeRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fees = await feeRepo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    const activeFees = fees.filter((f) => f.isActive);
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byCode = (pool, code) => pool.find((f) => norm(f.code) === norm(code));
    const byNameHint = (pool, hints) => pool.find((f) => hints.some((h) => norm(f.name).includes(norm(h)) || norm(f.code).includes(norm(h))));
    const resolveFee = (preferredCode, aliases, opts) => {
        let candidates = [
            byCode(activeFees, preferredCode),
            byNameHint(activeFees, aliases),
            byCode(fees, preferredCode),
            byNameHint(fees, aliases),
        ].filter(Boolean);
        if (!candidates.length)
            return undefined;
        if (opts?.rejectHints?.length) {
            const rejects = opts.rejectHints.map((h) => norm(h));
            const filtered = candidates.filter((f) => {
                const text = `${norm(f.code)} ${norm(f.name)}`;
                return !rejects.some((r) => text.includes(r));
            });
            if (filtered.length)
                candidates = filtered;
        }
        if (opts?.preferNonZeroAmount) {
            const nonZero = candidates.find((f) => Number(f.defaultAmount) > 0);
            if (nonZero)
                return nonZero;
        }
        return candidates[0];
    };
    const tuitionCode = tuitionFeeCodeForFormLevel(level);
    let tuitionFee = resolveFee(tuitionCode, level >= 5
        ? ['advanced level tuition', 'a level tuition', 'advanced tuition', 'tuition fees', 'tuition']
        : ['ordinary level tuition', 'o level tuition', 'ordinary tuition', 'tuition fees', 'tuition'], {
        preferNonZeroAmount: true,
        rejectHints: level >= 5 ? ['ordinary', 'o level', 'olevel'] : ['advanced', 'a level', 'alevel'],
    });
    if (level < 5 && (!tuitionFee || Number(tuitionFee.defaultAmount) <= 0)) {
        const ordinaryFallback = resolveFee('tuition', ['ordinary level tuition fees', 'ordinary tuition', 'tuition fees', 'tuition'], { preferNonZeroAmount: true, rejectHints: ['advanced', 'a level', 'alevel'] });
        if (ordinaryFallback)
            tuitionFee = ordinaryFallback;
    }
    if (!tuitionFee) {
        const def = exports.REGISTRATION_FEE_DEFINITIONS.find((d) => d.code === tuitionCode);
        if (def) {
            tuitionFee = await feeRepo.save(feeRepo.create({
                ...def,
                isActive: true,
                defaultAmount: Number(def.defaultAmount || 0),
            }));
        }
    }
    return tuitionFee || null;
}
function bulkTuitionInvoiceDescription(nextTermName) {
    return `Tuition fees for ${nextTermName}`;
}
async function createRegistrationInvoiceForStudent(student, form) {
    await ensureRegistrationSchoolFees();
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const existing = await invoiceRepo.findOne({
        where: {
            studentId: student.id,
            description: `New student registration — ${form.name} (${student.admissionNumber})`,
        },
        relations: (0, typeorm_helpers_1.relations)('lines'),
        order: { createdAt: 'DESC' },
    });
    const level = resolveFormLevel(form);
    const tuitionCode = tuitionFeeCodeForFormLevel(level);
    const feeRepo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fees = await feeRepo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    const activeFees = fees.filter((f) => f.isActive);
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byCode = (pool, code) => pool.find((f) => norm(f.code) === norm(code));
    const byNameHint = (pool, hints) => pool.find((f) => hints.some((h) => norm(f.name).includes(norm(h)) || norm(f.code).includes(norm(h))));
    const resolveFee = (preferredCode, aliases, opts) => {
        let candidates = [
            byCode(activeFees, preferredCode),
            byNameHint(activeFees, aliases),
            byCode(fees, preferredCode),
            byNameHint(fees, aliases),
        ].filter(Boolean);
        if (!candidates.length)
            return undefined;
        if (opts?.rejectHints?.length) {
            const rejects = opts.rejectHints.map((h) => norm(h));
            const filtered = candidates.filter((f) => {
                const text = `${norm(f.code)} ${norm(f.name)}`;
                return !rejects.some((r) => text.includes(r));
            });
            if (filtered.length)
                candidates = filtered;
        }
        if (opts?.preferNonZeroAmount) {
            const nonZero = candidates.find((f) => Number(f.defaultAmount) > 0);
            if (nonZero)
                return nonZero;
        }
        return candidates[0];
    };
    let deskFee = resolveFee(exports.REGISTRATION_FEE_CODES.desk, ['desk fee', 'desk']);
    let registrationFee = resolveFee(exports.REGISTRATION_FEE_CODES.registration, ['registration fee', 'registration']);
    let tuitionFee = resolveFee(tuitionCode, level >= 5
        ? ['advanced level tuition', 'a level tuition', 'advanced tuition', 'tuition fees', 'tuition']
        : ['ordinary level tuition', 'o level tuition', 'ordinary tuition', 'tuition fees', 'tuition'], {
        preferNonZeroAmount: true,
        rejectHints: level >= 5 ? ['ordinary', 'o level', 'olevel'] : ['advanced', 'a level', 'alevel'],
    });
    if (level < 5 && (!tuitionFee || Number(tuitionFee.defaultAmount) <= 0)) {
        const ordinaryFallback = resolveFee('tuition', ['ordinary level tuition fees', 'ordinary tuition', 'tuition fees', 'tuition'], { preferNonZeroAmount: true, rejectHints: ['advanced', 'a level', 'alevel'] });
        if (ordinaryFallback)
            tuitionFee = ordinaryFallback;
    }
    // Ensure required registration fee rows exist if still unresolved.
    const missingCodes = [];
    if (!deskFee)
        missingCodes.push(exports.REGISTRATION_FEE_CODES.desk);
    if (!registrationFee)
        missingCodes.push(exports.REGISTRATION_FEE_CODES.registration);
    if (!tuitionFee)
        missingCodes.push(tuitionCode);
    if (missingCodes.length > 0) {
        const byCode = new Map(exports.REGISTRATION_FEE_DEFINITIONS.map((d) => [d.code, d]));
        for (const code of missingCodes) {
            const def = byCode.get(code);
            if (!def)
                continue;
            const created = await feeRepo.save(feeRepo.create({
                ...def,
                isActive: true,
                defaultAmount: Number(def.defaultAmount || 0),
            }));
            fees.push(created);
            if (code === exports.REGISTRATION_FEE_CODES.desk)
                deskFee = created;
            if (code === exports.REGISTRATION_FEE_CODES.registration)
                registrationFee = created;
            if (code === tuitionCode)
                tuitionFee = created;
        }
    }
    if (!deskFee || !registrationFee || !tuitionFee) {
        throw new Error('Unable to resolve registration fees (desk, registration, tuition) from Manage Fees.');
    }
    const lines = [deskFee, registrationFee, tuitionFee].map((fee) => ({
        description: fee.name,
        quantity: 1,
        unitPrice: Number(fee.defaultAmount),
        amount: Number(fee.defaultAmount),
    }));
    const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
    const termId = await getCurrentTermId();
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().split('T')[0];
    const description = `New student registration — ${form.name} (${student.admissionNumber})`;
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    let invoice;
    if (existing) {
        const oldTotal = Number(existing.totalAmount || 0);
        const paid = Number(existing.amountPaid || 0);
        existing.termId = termId;
        existing.feeType = exports.REGISTRATION_FEE_CODES.registration;
        existing.description = description;
        existing.totalAmount = totalAmount;
        existing.issuedDate = (0, helpers_1.today)();
        existing.dueDate = dueDate;
        existing.lines = lines;
        existing.status =
            paid >= totalAmount
                ? enums_1.InvoiceStatus.PAID
                : paid > 0
                    ? enums_1.InvoiceStatus.PARTIAL
                    : enums_1.InvoiceStatus.SENT;
        invoice = await invoiceRepo.save(existing);
        const delta = totalAmount - oldTotal;
        if (delta !== 0) {
            const lastLedger = await ledgerRepo.findOne({
                where: { studentId: student.id },
                order: { createdAt: 'DESC' },
            });
            const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
            await ledgerRepo.save(ledgerRepo.create({
                studentId: student.id,
                termId,
                entryDate: (0, helpers_1.today)(),
                description: `Registration invoice adjustment ${invoice.invoiceNumber}`,
                debit: delta > 0 ? delta : 0,
                credit: delta < 0 ? Math.abs(delta) : 0,
                balance: prevBalance + delta,
                referenceType: 'invoice',
                referenceId: invoice.id,
            }));
        }
    }
    else {
        const created = invoiceRepo.create({
            invoiceNumber: (0, helpers_1.generateNumber)('INV'),
            studentId: student.id,
            termId,
            feeType: exports.REGISTRATION_FEE_CODES.registration,
            description,
            totalAmount,
            amountPaid: 0,
            issuedDate: (0, helpers_1.today)(),
            dueDate,
            status: enums_1.InvoiceStatus.SENT,
            lines,
        });
        invoice = await invoiceRepo.save(Array.isArray(created) ? created[0] : created);
        const lastLedger = await ledgerRepo.findOne({
            where: { studentId: student.id },
            order: { createdAt: 'DESC' },
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await ledgerRepo.save(ledgerRepo.create({
            studentId: student.id,
            termId,
            entryDate: (0, helpers_1.today)(),
            description: `Invoice ${invoice.invoiceNumber} - ${description}`,
            debit: totalAmount,
            credit: 0,
            balance: prevBalance + totalAmount,
            referenceType: 'invoice',
            referenceId: invoice.id,
        }));
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    let termName;
    if (termId) {
        const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
        termName = term?.name;
    }
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const fullStudent = await studentRepo.findOne({
        where: { id: student.id },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'form'),
    });
    const pdfPath = await (0, pdf_1.generateInvoicePdf)({
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: fullStudent?.schoolClass?.name || form.name,
        description,
        feeType: invoice.feeType,
        issuedDate: invoice.issuedDate || (0, helpers_1.today)(),
        dueDate,
        status: invoice.status,
        totalAmount,
        amountPaid: 0,
        termName,
        lines,
        ...branding,
    });
    invoice.pdfPath = pdfPath;
    await invoiceRepo.save(invoice);
    if (termId) {
        await (0, term_balance_service_1.ensureTermBalanceInitialized)(student.id, termId);
        await (0, term_balance_service_1.applyAvailablePrepaidToInvoice)(invoice);
        await (0, term_balance_service_1.refreshTermClosingBalance)(student.id, termId);
    }
    return invoiceRepo.findOne({
        where: { id: invoice.id },
        relations: (0, typeorm_helpers_1.relations)('lines'),
    });
}
