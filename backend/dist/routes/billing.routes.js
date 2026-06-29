"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const helpers_1 = require("../utils/helpers");
const pdf_1 = require("../utils/pdf");
const fee_catalog_service_1 = require("../services/fee-catalog.service");
const registration_invoice_service_1 = require("../services/registration-invoice.service");
const school_branding_service_1 = require("../services/school-branding.service");
const whatsapp_service_1 = require("../services/whatsapp.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const fin_reports_service_1 = require("../services/fin-reports.service");
const term_balance_service_1 = require("../services/term-balance.service");
const bulk_tuition_invoice_service_1 = require("../services/bulk-tuition-invoice.service");
const fee_collection_revenue_service_1 = require("../services/fee-collection-revenue.service");
const pdf_2 = require("../utils/pdf");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
async function assertParentStudentAccess(req, studentId) {
    if (req.user.role === enums_1.UserRole.STUDENT) {
        return req.user.studentId === studentId ? null : 'You can only view your own finance records';
    }
    if (req.user.role !== enums_1.UserRole.PARENT) {
        return null;
    }
    if (!req.user.parentId) {
        return 'Parent profile not linked';
    }
    const link = await data_source_1.AppDataSource.getRepository(entities_1.Guardian).findOne({
        where: { parentId: req.user.parentId, studentId },
    });
    return link ? null : 'You can only view finance for your linked students';
}
async function notifyLinkedParentUsersOfReceipt(manager, senderId, student, receipt, payment) {
    const guardianRepo = manager.getRepository(entities_1.Guardian);
    const messageRepo = manager.getRepository(entities_1.Message);
    const guardians = await guardianRepo.find({
        where: { studentId: student.id },
        relations: (0, typeorm_helpers_1.relations)('parent', 'parent.user'),
    });
    const parentUserIds = new Set();
    for (const g of guardians) {
        const user = g.parent?.user;
        if (g.parent?.userId && user?.isActive !== false) {
            parentUserIds.add(g.parent.userId);
        }
    }
    if (!parentUserIds.size)
        return;
    const amount = Number(payment.amount);
    const subject = `Payment receipt — ${student.firstName} ${student.lastName}`;
    const body = `A payment of $${amount.toFixed(2)} was received for ${student.firstName} ${student.lastName}.\n\n` +
        `Receipt number: ${receipt.receiptNumber}\n` +
        `Payment reference: ${payment.paymentReference}\n` +
        `Description: ${payment.label}\n\n` +
        `Open Finance in the Parent Portal to view and download all receipts.`;
    const messages = [...parentUserIds].map((recipientId) => messageRepo.create({
        senderId,
        recipientId,
        studentId: student.id,
        subject,
        body,
        isRead: false,
    }));
    await messageRepo.save(messages);
}
async function renderPdfHeaderWithLogo(doc, title, opts) {
    const margin = opts?.margin ?? 34;
    const logoSize = opts?.logoSize ?? 36;
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({ where: { id: 'default' } });
    const schoolName = settings?.schoolName || 'School Pro Academy';
    const tagline = settings?.tagline || '';
    const logoUrl = settings?.logoUrl;
    const logoPath = logoUrl ? path_1.default.join(process.cwd(), logoUrl.replace(/^\/+/, '')) : null;
    const hasLogo = Boolean(logoPath && fs_1.default.existsSync(logoPath));
    let titleX = margin;
    if (hasLogo && logoPath) {
        try {
            doc.image(logoPath, margin, margin - 8, { fit: [logoSize, logoSize] });
            titleX = margin + logoSize + 10;
        }
        catch {
            titleX = margin;
        }
    }
    const lineY = margin + logoSize + 10;
    const contentW = doc.page.width - margin * 2;
    doc.fontSize(12).font('Helvetica-Bold').text(schoolName, titleX, margin - 2, { width: contentW - (titleX - margin) });
    if (tagline) {
        doc.fontSize(8).fillColor('#64748b').text(tagline, titleX, margin + 14, { width: contentW - (titleX - margin) });
        doc.fillColor('#000000');
    }
    doc.fontSize(15).font('Helvetica-Bold').text(title, margin, margin + logoSize + 2);
    if (opts?.subtitle) {
        doc.moveDown(0.2);
        doc.fontSize(9).font('Helvetica').text(opts.subtitle);
    }
    // Keep divider safely below the title/subtitle block to avoid crossing text.
    const dividerY = Math.max(lineY, doc.y + 8);
    doc.moveTo(margin, dividerY).lineTo(margin + contentW, dividerY).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.6);
}
function scalePdfTableCols(columns, targetW) {
    const sum = columns.reduce((s, c) => s + c.w, 0);
    if (!sum || Math.abs(sum - targetW) < 1)
        return columns;
    const scaled = columns.map((c) => ({ ...c, w: Math.floor((c.w / sum) * targetW) }));
    const used = scaled.reduce((s, c) => s + c.w, 0);
    scaled[scaled.length - 1] = { ...scaled[scaled.length - 1], w: scaled[scaled.length - 1].w + (targetW - used) };
    return scaled;
}
function renderGeneratedFooter(doc, generatedAt, margin = 34) {
    const contentW = doc.page.width - margin * 2;
    const y = doc.page.height - margin - 8;
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
    const pad2 = (n) => String(n).padStart(2, '0');
    const formatted = `${pad2(generatedAt.getDate())}/${pad2(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()}, ${pad2(generatedAt.getHours())}:${pad2(generatedAt.getMinutes())}:${pad2(generatedAt.getSeconds())}`;
    doc.text(`Generated: ${formatted}`, margin, y, { width: contentW, align: 'center' });
}
router.get('/fees', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.TEACHER), async (req, res) => {
    await (0, registration_invoice_service_1.ensureRegistrationSchoolFees)();
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const activeOnly = req.query.active === 'true';
    const fees = await repo.find({
        ...(activeOnly ? { where: { isActive: true } } : {}),
        order: { sortOrder: 'ASC', name: 'ASC' },
    });
    res.json(fees);
});
router.post('/fees', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    await (0, registration_invoice_service_1.ensureRegistrationSchoolFees)();
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Fee name is required' });
    }
    const feeCode = (0, fee_catalog_service_1.normalizeFeeCode)(code || name);
    if (!feeCode) {
        return res.status(400).json({ message: 'Fee code is required' });
    }
    const existing = await repo.findOne({ where: { code: feeCode } });
    if (existing) {
        return res.status(409).json({ message: 'A fee with this code already exists' });
    }
    const fee = await repo.save(repo.create({
        code: feeCode,
        name: String(name).trim(),
        description: description?.trim() || undefined,
        defaultAmount: Number(defaultAmount) || 0,
        icon: icon?.trim() || undefined,
        isActive: isActive !== false,
        sortOrder: Number(sortOrder) || 0,
    }));
    res.status(201).json(fee);
});
router.patch('/fees/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fee = await repo.findOne({ where: { id: req.params.id } });
    if (!fee)
        return res.status(404).json({ message: 'Fee not found' });
    const { name, code, description, defaultAmount, icon, isActive, sortOrder } = req.body;
    if (name !== undefined)
        fee.name = String(name).trim();
    if (description !== undefined)
        fee.description = description?.trim() || undefined;
    if (defaultAmount !== undefined)
        fee.defaultAmount = Number(defaultAmount) || 0;
    if (icon !== undefined)
        fee.icon = icon?.trim() || undefined;
    if (isActive !== undefined)
        fee.isActive = Boolean(isActive);
    if (sortOrder !== undefined)
        fee.sortOrder = Number(sortOrder) || 0;
    if (code !== undefined) {
        const feeCode = (0, fee_catalog_service_1.normalizeFeeCode)(code);
        if (!feeCode)
            return res.status(400).json({ message: 'Invalid fee code' });
        if (feeCode !== fee.code) {
            const inUse = await (0, fee_catalog_service_1.isFeeCodeInUse)(fee.code);
            if (inUse) {
                return res.status(400).json({
                    message: 'Cannot change code — this fee is already used on invoices or payments',
                });
            }
            const clash = await repo.findOne({ where: { code: feeCode } });
            if (clash && clash.id !== fee.id) {
                return res.status(409).json({ message: 'Another fee already uses this code' });
            }
            fee.code = feeCode;
        }
    }
    res.json(await repo.save(fee));
});
router.delete('/fees/:id', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const fee = await repo.findOne({ where: { id: req.params.id } });
    if (!fee)
        return res.status(404).json({ message: 'Fee not found' });
    const force = req.query.force === 'true' || req.query.force === '1';
    const usage = await (0, fee_catalog_service_1.countFeeCodeUsage)(fee.code);
    const inUse = usage.invoices > 0 || usage.payments > 0;
    if (inUse && !force) {
        return res.status(400).json({
            message: 'This fee is linked to invoices or payments. Deactivate it instead of deleting.',
            linked: true,
            usage,
        });
    }
    await repo.delete({ id: fee.id });
    res.json({
        message: inUse
            ? `Fee deleted. ${usage.invoices} invoice(s) and ${usage.payments} payment(s) still reference code "${fee.code}".`
            : 'Fee deleted',
        forced: inUse,
    });
});
router.get('/invoices', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const { studentId, status, termId } = req.query;
    const qb = repo.createQueryBuilder('i')
        .leftJoinAndSelect('i.student', 's')
        .leftJoinAndSelect('s.schoolClass', 'c')
        .leftJoinAndSelect('i.lines', 'l');
    if (studentId)
        qb.andWhere('i.studentId = :studentId', { studentId });
    if (status)
        qb.andWhere('i.status = :status', { status });
    if (termId)
        qb.andWhere('i.termId = :termId', { termId });
    if (req.user.role === enums_1.UserRole.PARENT) {
        const children = await data_source_1.AppDataSource.query(`SELECT "studentId" FROM guardians WHERE "parentId" = $1`, [req.user.parentId]);
        const ids = children.map((c) => c.studentId);
        if (!ids.length)
            return res.json([]);
        qb.andWhere('i.studentId IN (:...ids)', { ids });
    }
    res.json(await qb.orderBy('i.createdAt', 'DESC').getMany());
});
router.get('/invoices/bulk-tuition/preview', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    try {
        res.json(await (0, bulk_tuition_invoice_service_1.previewBulkTuitionInvoices)());
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to preview bulk tuition billing' });
    }
});
router.post('/invoices/bulk-tuition', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    try {
        const result = await (0, bulk_tuition_invoice_service_1.createBulkTuitionInvoices)();
        res.status(201).json({
            message: `Created ${result.created} tuition invoice${result.created === 1 ? '' : 's'} for ${result.nextTerm.name} on ${result.currentTerm.name} balances.`,
            ...result,
        });
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to create bulk tuition invoices' });
    }
});
router.post('/invoices/bulk-tuition/reverse', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    try {
        const nextTermName = typeof req.body?.nextTermName === 'string' ? req.body.nextTermName.trim() : undefined;
        const result = await (0, bulk_tuition_invoice_service_1.reverseBulkTuitionInvoices)(nextTermName || undefined);
        res.json({
            message: `Removed ${result.removed} bulk tuition invoice${result.removed === 1 ? '' : 's'} from ${result.billingTermName} balances.`,
            ...result,
        });
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to reverse bulk tuition invoices' });
    }
});
router.post('/invoices', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const { lines, ...data } = req.body;
    const student = await studentRepo.findOne({
        where: { id: data.studentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    const totalAmount = lines?.reduce((s, l) => s + Number(l.amount), 0) || data.totalAmount;
    const created = repo.create({
        ...data,
        invoiceNumber: (0, helpers_1.generateNumber)('INV'),
        totalAmount,
        issuedDate: (0, helpers_1.today)(),
        status: enums_1.InvoiceStatus.SENT,
        lines,
    });
    const invoice = await repo.save(Array.isArray(created) ? created[0] : created);
    const lastLedger = await ledgerRepo.findOne({
        where: { studentId: data.studentId },
        order: { createdAt: 'DESC' },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    await ledgerRepo.save(ledgerRepo.create({
        studentId: data.studentId,
        termId: data.termId,
        entryDate: (0, helpers_1.today)(),
        description: `Invoice ${invoice.invoiceNumber} - ${data.description}`,
        debit: totalAmount,
        credit: 0,
        balance: prevBalance + Number(totalAmount),
        referenceType: 'invoice',
        referenceId: invoice.id,
    }));
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    let termName;
    if (data.termId) {
        const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: data.termId } });
        termName = term?.name;
    }
    const invoiceLines = lines?.map((l) => ({
        description: l.description,
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice ?? l.amount,
        amount: Number(l.amount),
    })) ?? [{ description: data.description, quantity: 1, unitPrice: totalAmount, amount: Number(totalAmount) }];
    const pdfPath = await (0, pdf_1.generateInvoicePdf)({
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.schoolClass?.name || 'N/A',
        description: data.description,
        feeType: data.feeType,
        issuedDate: invoice.issuedDate || (0, helpers_1.today)(),
        dueDate: data.dueDate,
        status: invoice.status,
        totalAmount: Number(totalAmount),
        amountPaid: Number(invoice.amountPaid),
        termName,
        lines: invoiceLines,
        ...branding,
    });
    invoice.pdfPath = pdfPath;
    await repo.save(invoice);
    if (data.termId) {
        await (0, term_balance_service_1.ensureTermBalanceInitialized)(data.studentId, data.termId);
        await (0, term_balance_service_1.applyAvailablePrepaidToInvoice)(invoice);
        await (0, term_balance_service_1.refreshTermClosingBalance)(data.studentId, data.termId);
    }
    res.status(201).json(invoice);
});
router.post('/payments', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { studentId, invoiceId, amount, method, feeType, label, notes } = req.body;
    const paymentAmount = Number(amount) || 0;
    if (paymentAmount <= 0) {
        return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const student = await studentRepo.findOne({
        where: { id: studentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form', 'guardians'),
    });
    if (!student)
        return res.status(404).json({ message: 'Student not found' });
    const queryRunner = data_source_1.AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const paymentRepo = queryRunner.manager.getRepository(entities_1.Payment);
        const invoiceRepo = queryRunner.manager.getRepository(entities_1.Invoice);
        const ledgerRepo = queryRunner.manager.getRepository(entities_1.LedgerEntry);
        const cashbookRepo = queryRunner.manager.getRepository(entities_1.CashbookEntry);
        const receiptRepo = queryRunner.manager.getRepository(entities_1.Receipt);
        const notifRepo = queryRunner.manager.getRepository(entities_1.Notification);
        const payment = await paymentRepo.save(paymentRepo.create({
            paymentReference: (0, helpers_1.generateNumber)('PAY'),
            studentId,
            invoiceId,
            amount: paymentAmount,
            method: method,
            feeType,
            label,
            notes,
            recordedById: req.user.userId,
        }));
        let ledgerTermId;
        let overpaymentRemaining = 0;
        if (invoiceId) {
            const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, studentId } });
            if (invoice) {
                ledgerTermId = invoice.termId || undefined;
                const due = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid));
                const applied = Math.min(due, paymentAmount);
                overpaymentRemaining = (0, term_balance_service_1.roundMoney)(paymentAmount - applied);
                invoice.amountPaid = Number(invoice.amountPaid) + applied;
                invoice.status = Number(invoice.amountPaid) >= Number(invoice.totalAmount)
                    ? enums_1.InvoiceStatus.PAID
                    : enums_1.InvoiceStatus.PARTIAL;
                await invoiceRepo.save(invoice);
            }
        }
        else {
            // Auto-allocate payment against outstanding invoices (oldest first).
            let remaining = paymentAmount;
            let primaryInvoiceId;
            const outstanding = await invoiceRepo.find({
                where: { studentId },
                order: { dueDate: 'ASC', createdAt: 'ASC' },
            });
            for (const inv of outstanding) {
                if (remaining <= 0)
                    break;
                const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
                if (due <= 0)
                    continue;
                const applied = Math.min(due, remaining);
                inv.amountPaid = Number(inv.amountPaid) + applied;
                inv.status = Number(inv.amountPaid) >= Number(inv.totalAmount)
                    ? enums_1.InvoiceStatus.PAID
                    : enums_1.InvoiceStatus.PARTIAL;
                await invoiceRepo.save(inv);
                if (!primaryInvoiceId)
                    primaryInvoiceId = inv.id;
                if (!ledgerTermId && inv.termId)
                    ledgerTermId = inv.termId;
                remaining -= applied;
            }
            overpaymentRemaining = (0, term_balance_service_1.roundMoney)(Math.max(0, remaining));
            if (primaryInvoiceId) {
                payment.invoiceId = primaryInvoiceId;
                await paymentRepo.save(payment);
            }
        }
        if (!ledgerTermId) {
            ledgerTermId = await (0, term_balance_service_1.resolvePaymentTermId)(studentId, invoiceId);
        }
        const lastLedger = await ledgerRepo.findOne({
            where: { studentId },
            order: { createdAt: 'DESC' },
        });
        const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
        await ledgerRepo.save(ledgerRepo.create({
            studentId,
            termId: ledgerTermId,
            entryDate: (0, helpers_1.today)(),
            description: `Payment - ${label}`,
            debit: 0,
            credit: paymentAmount,
            balance: prevBalance - paymentAmount,
            referenceType: 'payment',
            referenceId: payment.id,
        }));
        const lastCash = await (0, typeorm_helpers_1.findLatest)(cashbookRepo);
        const cashBalance = lastCash ? Number(lastCash.balance) : 0;
        await cashbookRepo.save(cashbookRepo.create({
            entryDate: (0, helpers_1.today)(),
            type: 'receipt',
            description: `${label} - ${student.firstName} ${student.lastName}`,
            moneyIn: paymentAmount,
            moneyOut: 0,
            balance: cashBalance + paymentAmount,
            paymentMethod: method,
            reference: payment.paymentReference,
            studentId,
            recordedById: req.user.userId,
        }));
        const branding = await (0, school_branding_service_1.loadSchoolBranding)();
        const receiptNumber = (0, helpers_1.generateNumber)('RCP');
        let linkedInvoiceNumber;
        if (invoiceId) {
            const linkedInv = await invoiceRepo.findOne({ where: { id: invoiceId, studentId } });
            linkedInvoiceNumber = linkedInv?.invoiceNumber;
        }
        const pdfPath = await (0, pdf_1.generateReceiptPdf)({
            receiptNumber,
            studentName: `${student.firstName} ${student.lastName}`,
            admissionNumber: student.admissionNumber,
            className: student.schoolClass?.name || 'N/A',
            amount: paymentAmount,
            method,
            label,
            paidAt: new Date(),
            paymentReference: payment.paymentReference,
            notes: notes || undefined,
            invoiceNumber: linkedInvoiceNumber,
            invoiceBalance: await fetchStudentInvoiceBalance(studentId, queryRunner.manager),
            ...branding,
        });
        const receipt = await receiptRepo.save(receiptRepo.create({
            receiptNumber,
            paymentId: payment.id,
            pdfPath,
        }));
        await notifyLinkedParentUsersOfReceipt(queryRunner.manager, req.user.userId, student, receipt, payment);
        await notifRepo.save(notifRepo.create({
            title: 'Payment Received',
            message: `${student.firstName} ${student.lastName} (${student.schoolClass?.name}) paid $${paymentAmount} for ${label}`,
            type: 'payment',
            metadata: { studentId, classId: student.classId, amount: paymentAmount, label },
        }));
        await queryRunner.commitTransaction();
        if (overpaymentRemaining > 0.005) {
            await (0, term_balance_service_1.recordOverpaymentPrepaid)(studentId, ledgerTermId, overpaymentRemaining);
        }
        if (ledgerTermId) {
            await (0, term_balance_service_1.refreshTermClosingBalance)(studentId, ledgerTermId);
        }
        const primaryGuardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
        if (primaryGuardian?.phone) {
            try {
                await (0, whatsapp_service_1.sendWhatsAppReminder)(primaryGuardian.phone, `Payment received for ${student.firstName}: $${paymentAmount} (${label}). Receipt: ${receiptNumber}`);
            }
            catch {
                // WhatsApp delivery should not rollback successful accounting writes.
            }
        }
        return res.status(201).json({ payment, receipt });
    }
    catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
    }
    finally {
        await queryRunner.release();
    }
});
router.get('/receipts/:id/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Receipt);
    const receipt = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('payment', 'payment.student', 'payment.student.schoolClass', 'payment.invoice'),
    });
    if (!receipt?.payment?.student) {
        return res.status(404).json({ message: 'Receipt not found' });
    }
    const accessError = await assertParentStudentAccess(req, receipt.payment.studentId);
    if (accessError) {
        return res.status(403).json({ message: accessError });
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const p = receipt.payment;
    const s = p.student;
    const pdfPath = await (0, pdf_1.generateReceiptPdf)({
        receiptNumber: receipt.receiptNumber,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        className: s.schoolClass?.name || 'N/A',
        amount: Number(p.amount),
        method: p.method,
        label: p.label,
        paidAt: p.paidAt,
        paymentReference: p.paymentReference,
        notes: p.notes || undefined,
        invoiceNumber: p.invoice?.invoiceNumber,
        invoiceBalance: await fetchStudentInvoiceBalance(s.id),
        ...branding,
    });
    receipt.pdfPath = pdfPath;
    await repo.save(receipt);
    const inline = String(req.query.preview || '') === 'true';
    const fileName = `receipt-${receipt.receiptNumber || receipt.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`);
    res.sendFile(path_1.default.resolve(pdfPath));
});
router.get('/invoices/:id/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const invoice = await repo.findOne({
        where: { id: req.params.id },
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'lines', 'term'),
    });
    if (!invoice?.student) {
        return res.status(404).json({ message: 'Invoice not found' });
    }
    if (req.user.role === enums_1.UserRole.PARENT) {
        const children = await data_source_1.AppDataSource.query(`SELECT "studentId" FROM guardians WHERE "parentId" = $1`, [req.user.parentId]);
        const ids = children.map((c) => c.studentId);
        if (!ids.includes(invoice.studentId)) {
            return res.status(403).json({ message: 'Access denied' });
        }
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const s = invoice.student;
    const lines = invoice.lines?.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
        amount: Number(l.amount),
    })) ??
        [{ description: invoice.description, quantity: 1, unitPrice: Number(invoice.totalAmount), amount: Number(invoice.totalAmount) }];
    const pdfPath = await (0, pdf_1.generateInvoicePdf)({
        invoiceNumber: invoice.invoiceNumber,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        className: s.schoolClass?.name || 'N/A',
        description: invoice.description,
        feeType: invoice.feeType,
        issuedDate: invoice.issuedDate || (0, helpers_1.today)(),
        dueDate: invoice.dueDate,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount),
        amountPaid: Number(invoice.amountPaid),
        termName: invoice.term?.name,
        lines,
        ...branding,
    });
    invoice.pdfPath = pdfPath;
    await repo.save(invoice);
    const inline = String(req.query.preview || '') === 'true';
    const fileName = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`);
    res.sendFile(path_1.default.resolve(pdfPath));
});
router.get('/receipts/student/:studentId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.PARENT, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const accessError = await assertParentStudentAccess(req, req.params.studentId);
    if (accessError) {
        return res.status(403).json({ message: accessError });
    }
    const payments = await data_source_1.AppDataSource.getRepository(entities_1.Payment).find({
        where: { studentId: req.params.studentId },
        relations: (0, typeorm_helpers_1.relations)('receipt'),
        order: { paidAt: 'DESC' },
    });
    res.json(payments.filter((p) => p.receipt).map((p) => ({ ...p.receipt, payment: p })));
});
router.get('/statement/:studentId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const accessError = await assertParentStudentAccess(req, req.params.studentId);
    if (accessError) {
        return res.status(403).json({ message: accessError });
    }
    const { termId } = req.query;
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const where = { studentId: req.params.studentId };
    if (termId)
        where.termId = termId;
    const ledger = await ledgerRepo.find({ where, order: { entryDate: 'ASC' } });
    const invoices = await invoiceRepo.find({ where: { studentId: req.params.studentId } });
    const payments = await paymentRepo.find({ where: { studentId: req.params.studentId } });
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = totalInvoiced - totalPaid;
    res.json({ ledger, invoices, payments, summary: { totalInvoiced, totalPaid, balance } });
});
router.get('/statement/:studentId/pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL, enums_1.UserRole.PARENT), async (req, res) => {
    const requestedStudentId = String(req.params.studentId || '').trim();
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    let resolvedForAccess = requestedStudentId;
    const studentForAccess = await studentRepo.findOne({ where: { id: requestedStudentId } })
        ?? await studentRepo.findOne({ where: { admissionNumber: requestedStudentId } });
    if (studentForAccess)
        resolvedForAccess = studentForAccess.id;
    const accessError = await assertParentStudentAccess(req, resolvedForAccess);
    if (accessError) {
        return res.status(403).json({ message: accessError });
    }
    const { termId } = req.query;
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    let student = await studentRepo.findOne({
        where: { id: requestedStudentId },
        relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
    });
    if (!student) {
        student = await studentRepo.findOne({
            where: { admissionNumber: requestedStudentId },
            relations: (0, typeorm_helpers_1.relations)('schoolClass', 'schoolClass.form'),
        });
    }
    const resolvedStudentId = student?.id || requestedStudentId;
    const where = { studentId: resolvedStudentId };
    if (termId)
        where.termId = termId;
    const ledger = await ledgerRepo.find({ where, order: { entryDate: 'ASC' } });
    const invoices = await invoiceRepo.find({ where: { studentId: resolvedStudentId }, order: { issuedDate: 'ASC' } });
    const payments = await paymentRepo.find({ where: { studentId: resolvedStudentId }, order: { paidAt: 'ASC' } });
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = totalInvoiced - totalPaid;
    const doc = new pdfkit_1.default({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        const inline = req.query.preview === 'true';
        const statementCode = student?.admissionNumber || requestedStudentId;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="student-statement-${statementCode}.pdf"`);
        res.send(pdf);
    });
    await renderPdfHeaderWithLogo(doc, 'Student Financial Statement', { margin: 36 });
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown Student';
    const studentCode = student?.admissionNumber || requestedStudentId;
    const margin = 36;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 28;
    let y = doc.y + 2;
    // Student identity card
    doc.save();
    doc.roundedRect(margin, y, contentW, 58, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
    doc.text(studentName, margin + 12, y + 11, { width: contentW - 24, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(`Student ID: ${studentCode}`, margin + 12, y + 30, { lineBreak: false });
    doc.text(`Class: ${student?.schoolClass?.name || '—'}`, margin + contentW / 2, y + 30, { lineBreak: false });
    y += 72;
    // Summary cards
    const cardGap = 8;
    const cardW = (contentW - cardGap * 2) / 3;
    const drawSummaryCard = (x, label, value, tone) => {
        const bg = tone === 'positive' ? '#ecfdf5' : tone === 'warn' ? '#fff7ed' : '#eef2ff';
        const border = tone === 'positive' ? '#a7f3d0' : tone === 'warn' ? '#fdba74' : '#c7d2fe';
        const fg = tone === 'positive' ? '#047857' : tone === 'warn' ? '#b45309' : '#3730a3';
        doc.save();
        doc.roundedRect(x, y, cardW, 48, 8).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(label.toUpperCase(), x + 10, y + 9, { width: cardW - 20 });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(fg).text(value, x + 10, y + 23, { width: cardW - 20 });
    };
    drawSummaryCard(margin, 'Total Invoiced', `$${totalInvoiced.toFixed(2)}`, 'neutral');
    drawSummaryCard(margin + cardW + cardGap, 'Total Paid', `$${totalPaid.toFixed(2)}`, 'positive');
    drawSummaryCard(margin + (cardW + cardGap) * 2, 'Balance Due', `$${balance.toFixed(2)}`, balance > 0 ? 'warn' : 'positive');
    y += 62;
    // Ledger title
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Ledger', margin, y);
    y += 14;
    const colX = {
        date: margin + 8,
        desc: margin + 92,
        debit: margin + contentW - 174,
        credit: margin + contentW - 116,
        balance: margin + contentW - 58,
    };
    const baseRowH = 19;
    const descWidth = colX.debit - colX.desc - 8;
    const drawLedgerHeader = () => {
        doc.save();
        doc.roundedRect(margin, y, contentW, baseRowH, 6).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('DATE', colX.date, y + 6);
        doc.text('DESCRIPTION', colX.desc, y + 6);
        doc.text('DEBIT', colX.debit, y + 6, { width: 52, align: 'right' });
        doc.text('CREDIT', colX.credit, y + 6, { width: 52, align: 'right' });
        doc.text('BALANCE', colX.balance, y + 6, { width: 50, align: 'right' });
        y += baseRowH + 2;
    };
    drawLedgerHeader();
    if (!ledger.length) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('No ledger entries for this statement.', margin, y + 6);
    }
    else {
        ledger.slice(0, 180).forEach((l, idx) => {
            const description = String(l.description || '');
            const descriptionHeight = doc
                .font('Helvetica')
                .fontSize(8)
                .heightOfString(description, { width: descWidth, align: 'left' });
            const rowH = Math.max(baseRowH, Math.ceil(descriptionHeight) + 8);
            if (y + rowH > pageBottom()) {
                doc.addPage({ size: 'A4', margin });
                y = margin + 4;
                drawLedgerHeader();
            }
            if (idx % 2 === 1) {
                doc.save();
                doc.rect(margin, y, contentW, rowH).fill('#f8fafc');
                doc.restore();
            }
            doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
            doc.text(String(l.entryDate || ''), colX.date, y + 6, { width: 80, lineBreak: false });
            doc.text(description, colX.desc, y + 6, { width: descWidth, align: 'left' });
            doc.text(`$${Number(l.debit || 0).toFixed(2)}`, colX.debit, y + 6, { width: 52, align: 'right', lineBreak: false });
            doc.text(`$${Number(l.credit || 0).toFixed(2)}`, colX.credit, y + 6, { width: 52, align: 'right', lineBreak: false });
            doc.font('Helvetica-Bold');
            doc.text(`$${Number(l.balance || 0).toFixed(2)}`, colX.balance, y + 6, { width: 50, align: 'right', lineBreak: false });
            y += rowH;
        });
    }
    renderGeneratedFooter(doc, new Date(), 36);
    doc.end();
});
router.post('/reminders/send', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { studentIds, message } = req.body;
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const sent = [];
    for (const id of studentIds) {
        const student = await studentRepo.findOne({ where: { id }, relations: (0, typeorm_helpers_1.relations)('guardians', 'schoolClass') });
        if (!student)
            continue;
        const guardian = student.guardians?.find((g) => g.isPrimary) || student.guardians?.[0];
        if (!guardian?.phone)
            continue;
        const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
        const unpaid = await invoiceRepo.find({
            where: { studentId: id, status: enums_1.InvoiceStatus.SENT },
        });
        const owed = unpaid.reduce((s, i) => s + (Number(i.totalAmount) - Number(i.amountPaid)), 0);
        if (owed <= 0)
            continue;
        const msg = message || `Fee reminder: ${student.firstName} ${student.lastName} (${student.schoolClass?.name}) owes $${owed.toFixed(2)}. Please arrange payment.`;
        await (0, whatsapp_service_1.sendWhatsAppReminder)(guardian.phone, msg);
        sent.push({ studentId: id, phone: guardian.phone, amountOwed: owed });
    }
    res.json({ sent: sent.length, details: sent });
});
async function fetchBillingSummary() {
    const [debtors, monthly, today, pending] = await Promise.all([
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as total
      FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments
      WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)
    `),
        data_source_1.AppDataSource.query(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM payments
      WHERE "paidAt"::date = CURRENT_DATE
    `),
        data_source_1.AppDataSource.query(`
      SELECT COUNT(*) as count FROM invoices WHERE status IN ('sent', 'partial', 'overdue')
    `),
    ]);
    return {
        totalDebtors: Number(debtors[0]?.total || 0),
        monthlyCollections: Number(monthly[0]?.total || 0),
        todayCollections: Number(today[0]?.total || 0),
        todayPaymentCount: Number(today[0]?.count || 0),
        pendingInvoices: Number(pending[0]?.count || 0),
    };
}
router.get('/summary', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    res.json(await fetchBillingSummary());
});
router.get('/payments', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { studentId } = req.query;
    const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
    const payments = await paymentRepo.find({
        ...(studentId ? { where: { studentId: studentId } } : {}),
        relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'receipt', 'invoice'),
        order: { paidAt: 'DESC' },
        take: limit,
    });
    res.json(payments);
});
async function fetchStudentInvoiceBalance(studentId, manager = data_source_1.AppDataSource.manager) {
    const result = await manager.query(`
      SELECT COALESCE(SUM("totalAmount" - "amountPaid"), 0) as owed
      FROM invoices
      WHERE "studentId" = $1 AND status IN ('sent', 'partial', 'overdue')
    `, [studentId]);
    return (0, term_balance_service_1.roundMoney)(Math.max(0, Number(result[0]?.owed || 0)));
}
async function fetchBillingDebtors() {
    const result = await data_source_1.AppDataSource.query(`
    SELECT s.id, s."firstName", s."lastName", s."admissionNumber", s.gender, c.name as "className",
      COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as owed,
      MAX(i."dueDate") as "oldestDue"
    FROM students s
    LEFT JOIN classes c ON c.id = s."classId"
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    WHERE s."isActive" = true
    GROUP BY s.id, s."firstName", s."lastName", s."admissionNumber", s.gender, c.name
    HAVING COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) > 0
    ORDER BY owed DESC
  `);
    return result.map((r) => ({ ...r, owed: Number(r.owed || 0) }));
}
router.get('/debtors', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    res.json(await fetchBillingDebtors());
});
router.get('/overview/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const inline = String(req.query.preview || '') === 'true';
    const tab = String(req.query.tab || 'debtors').toLowerCase();
    const debtorQ = String(req.query.debtorQ || '').trim().toLowerCase();
    const invoiceQ = String(req.query.invoiceQ || '').trim().toLowerCase();
    const invoiceStatus = String(req.query.invoiceStatus || 'all').toLowerCase();
    const summary = await fetchBillingSummary();
    const money = (n) => `$${Number(n || 0).toFixed(2)}`;
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtDate = (d) => {
        if (!d)
            return '—';
        const dt = new Date(String(d));
        if (Number.isNaN(dt.getTime()))
            return String(d);
        return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
    };
    const classLabel = (raw) => {
        const cls = String(raw || '').trim();
        if (!cls)
            return '—';
        return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
    };
    const formatMethod = (m) => {
        const map = {
            cash: 'Cash', bank: 'Bank', ecocash: 'EcoCash', onemoney: 'OneMoney', innbucks: 'InnBucks', other: 'Other',
        };
        return map[m] || m;
    };
    const formatGender = (g) => {
        const raw = String(g || '').trim();
        if (!raw)
            return '—';
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    };
    let sectionTitle = 'Debtors';
    let tableRows = [];
    let cols = [];
    if (tab === 'invoices') {
        sectionTitle = 'Invoices';
        const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
        let invoices = await invoiceRepo.find({
            relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass'),
            order: { createdAt: 'DESC' },
            take: 500,
        });
        if (invoiceStatus !== 'all') {
            invoices = invoices.filter((i) => i.status === invoiceStatus);
        }
        if (invoiceQ) {
            invoices = invoices.filter((i) => `${i.invoiceNumber} ${i.description} ${i.student?.firstName || ''} ${i.student?.lastName || ''}`
                .toLowerCase()
                .includes(invoiceQ));
        }
        cols = [
            { label: 'INVOICE #', w: 88 },
            { label: 'STUDENT', w: 120 },
            { label: 'CLASS', w: 72 },
            { label: 'DESCRIPTION', w: 130 },
            { label: 'TOTAL', w: 72, align: 'right' },
            { label: 'PAID', w: 72, align: 'right' },
            { label: 'DUE', w: 68 },
            { label: 'STATUS', w: 68 },
        ];
        tableRows = invoices.map((inv) => [
            inv.invoiceNumber || '—',
            `${inv.student?.firstName || ''} ${inv.student?.lastName || ''}`.trim() || '—',
            classLabel(inv.student?.schoolClass?.name || ''),
            inv.description || '—',
            money(Number(inv.totalAmount)),
            money(Number(inv.amountPaid)),
            fmtDate(inv.dueDate),
            String(inv.status || '—'),
        ]);
    }
    else if (tab === 'receipts') {
        sectionTitle = 'Recent Payments';
        const paymentRepo = data_source_1.AppDataSource.getRepository(entities_1.Payment);
        const payments = await paymentRepo.find({
            relations: (0, typeorm_helpers_1.relations)('student', 'student.schoolClass', 'receipt'),
            order: { paidAt: 'DESC' },
            take: 40,
        });
        cols = [
            { label: 'DATE', w: 78 },
            { label: 'RECEIPT #', w: 88 },
            { label: 'STUDENT', w: 120 },
            { label: 'CLASS', w: 72 },
            { label: 'LABEL', w: 120 },
            { label: 'METHOD', w: 72 },
            { label: 'AMOUNT', w: 72, align: 'right' },
        ];
        tableRows = payments.map((p) => [
            fmtDate(p.paidAt),
            p.receipt?.receiptNumber || '—',
            `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim() || '—',
            classLabel(p.student?.schoolClass?.name || ''),
            p.label || '—',
            formatMethod(String(p.method || '')),
            money(Number(p.amount)),
        ]);
    }
    else {
        let debtors = await fetchBillingDebtors();
        if (debtorQ) {
            debtors = debtors.filter((d) => `${d.firstName} ${d.lastName} ${d.className} ${d.admissionNumber} ${d.gender || ''}`.toLowerCase().includes(debtorQ));
        }
        cols = [
            { label: 'STUDENT ID', w: 72 },
            { label: 'LAST NAME', w: 100 },
            { label: 'FIRST NAME', w: 100 },
            { label: 'GENDER', w: 52 },
            { label: 'CLASS', w: 72 },
            { label: 'OLDEST DUE', w: 76 },
            { label: 'OWED', w: 72, align: 'right' },
        ];
        tableRows = debtors.map((d) => [
            String(d.admissionNumber || '—'),
            String(d.lastName || '—'),
            String(d.firstName || '—'),
            formatGender(d.gender),
            classLabel(d.className || ''),
            fmtDate(d.oldestDue),
            money(d.owed),
        ]);
    }
    const tabLabels = {
        payment: 'Record Payment',
        invoice: 'Create Invoice',
        invoices: 'All Invoices',
        receipts: 'Receipts',
        debtors: 'Debtors',
    };
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="billing-overview.pdf"`);
        res.send(pdf);
    });
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Billing & Payments Report', {
        margin,
        subtitle: `Section: ${tabLabels[tab] || tab}`,
    });
    y = Math.max(doc.y + 2, y);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    const filterBits = [];
    if (debtorQ)
        filterBits.push(`Debtor search: ${debtorQ}`);
    if (invoiceQ)
        filterBits.push(`Invoice search: ${invoiceQ}`);
    if (invoiceStatus !== 'all')
        filterBits.push(`Invoice status: ${invoiceStatus}`);
    if (filterBits.length) {
        doc.text(filterBits.join('   |   '), margin, y);
        y += 14;
    }
    const gap = 8;
    const cardW = (contentW - gap * 3) / 4;
    const drawCard = (x, label, value, tone = 'neutral') => {
        const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : '#eff6ff';
        const border = tone === 'positive' ? '#86efac' : tone === 'warn' ? '#fdba74' : '#bfdbfe';
        const fg = tone === 'positive' ? '#166534' : tone === 'warn' ? '#9a3412' : '#1d4ed8';
        doc.save();
        doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x + 9, y + 8, { width: cardW - 18 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
    };
    drawCard(margin, "Today's Collections", money(summary.todayCollections), 'positive');
    drawCard(margin + cardW + gap, 'This Month', money(summary.monthlyCollections), 'neutral');
    drawCard(margin + (cardW + gap) * 2, 'Outstanding', money(summary.totalDebtors), 'warn');
    drawCard(margin + (cardW + gap) * 3, 'Pending Invoices', String(summary.pendingInvoices), 'neutral');
    y += 52;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(sectionTitle, margin, y);
    y += 16;
    cols = scalePdfTableCols(cols, contentW);
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const drawHeader = () => {
        let x = margin;
        doc.save();
        doc.roundedRect(margin, y, tableW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        for (const c of cols) {
            doc.text(c.label, x + 4, y + 6, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
            x += c.w;
        }
        y += 20;
    };
    if (!tableRows.length) {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('No records to display.', margin, y);
        renderGeneratedFooter(doc, new Date(), margin);
        doc.end();
        return;
    }
    drawHeader();
    let rowIndex = 0;
    tableRows.forEach((vals) => {
        doc.font('Helvetica').fontSize(8);
        let rowH = 0;
        for (let i = 0; i < cols.length; i++) {
            rowH = Math.max(rowH, doc.heightOfString(vals[i], { width: cols[i].w - 8, align: cols[i].align || 'left' }));
        }
        rowH = Math.max(17, Math.ceil(rowH) + 6);
        if (y + rowH > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawHeader();
        }
        if (rowIndex % 2 === 1) {
            doc.save();
            doc.rect(margin, y, tableW, rowH).fill('#f8fafc');
            doc.restore();
        }
        doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
        let x = margin;
        for (let i = 0; i < cols.length; i++) {
            doc.text(vals[i], x + 4, y + 3, { width: cols[i].w - 8, align: cols[i].align || 'left' });
            x += cols[i].w;
        }
        y += rowH;
        rowIndex += 1;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
router.get('/reports/student-ledger', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const termId = String(req.query.termId || '').trim();
    const q = String(req.query.q || '').trim();
    const studentId = String(req.query.studentId || '').trim();
    if (!termId) {
        return res.status(400).json({ message: 'termId is required' });
    }
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        return res.status(404).json({ message: 'Term not found' });
    let targetStudentId = studentId;
    if (!targetStudentId) {
        if (!q) {
            return res.status(400).json({ message: 'Enter Student ID, first name, or last name' });
        }
        const matches = await (0, fin_reports_service_1.searchStudents)(q);
        if (!matches.length) {
            return res.status(404).json({ message: 'No matching student found' });
        }
        if (matches.length > 1) {
            return res.json({ needsSelection: true, term: { id: term.id, name: term.name }, matches });
        }
        targetStudentId = matches[0].id;
    }
    const report = await (0, fin_reports_service_1.buildStudentLedgerReport)(targetStudentId, termId);
    if (!report)
        return res.status(404).json({ message: 'Student not found' });
    return res.json({ needsSelection: false, report });
});
router.get('/reports/student-ledger/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const termId = String(req.query.termId || '').trim();
    const q = String(req.query.q || '').trim();
    const studentId = String(req.query.studentId || '').trim();
    const inline = String(req.query.preview || '') === 'true';
    if (!termId)
        return res.status(400).json({ message: 'termId is required' });
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({ where: { id: termId } });
    if (!term)
        return res.status(404).json({ message: 'Term not found' });
    let targetStudentId = studentId;
    if (!targetStudentId) {
        if (!q)
            return res.status(400).json({ message: 'Enter Student ID, first name, or last name' });
        const matches = await (0, fin_reports_service_1.searchStudents)(q);
        if (!matches.length)
            return res.status(404).json({ message: 'No matching student found' });
        if (matches.length > 1)
            return res.status(400).json({ message: 'Multiple students match — select one student before exporting' });
        targetStudentId = matches[0].id;
    }
    const report = await (0, fin_reports_service_1.buildStudentLedgerReport)(targetStudentId, termId);
    if (!report)
        return res.status(404).json({ message: 'Student not found' });
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="student-ledger-${report.student.admissionNumber || report.student.id}.pdf"`);
        res.send(pdf);
    });
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Student Ledger Report', { margin });
    y = Math.max(y, doc.y + 2);
    const studentName = `${report.student.firstName || ''} ${report.student.lastName || ''}`.trim() || 'Unknown Student';
    const classLabel = `${report.student.formName || ''} ${report.student.className || ''}`.trim() || '—';
    const fmtMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
    const typeLabel = (type) => type === 'invoice' ? 'INVOICE' : type === 'payment' ? 'PAYMENT' : 'OPENING';
    doc.save();
    doc.roundedRect(margin, y, contentW, 44, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(studentName, margin + 10, y + 8);
    doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
    doc.text(`Student ID: ${report.student.admissionNumber || '—'}`, margin + 10, y + 24);
    doc.text(`Class: ${classLabel}`, margin + 170, y + 24);
    doc.text(`Term: ${report.term.name}`, margin + 300, y + 24);
    y += 54;
    const cardGap = 8;
    const cardW = (contentW - cardGap * 3) / 4;
    const drawSummaryCard = (x, label, value, tone) => {
        const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : '#eff6ff';
        const border = tone === 'positive' ? '#a7f3d0' : tone === 'warn' ? '#fdba74' : '#bfdbfe';
        const fg = tone === 'positive' ? '#047857' : tone === 'warn' ? '#c2410c' : '#1d4ed8';
        doc.save();
        doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x + 9, y + 8, { width: cardW - 18 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
    };
    drawSummaryCard(margin, 'Opening', fmtMoney(report.summary.openingBalance), 'neutral');
    drawSummaryCard(margin + cardW + cardGap, 'Debits', fmtMoney(report.summary.totalDebits), 'neutral');
    drawSummaryCard(margin + (cardW + cardGap) * 2, 'Credits', fmtMoney(report.summary.totalCredits), 'positive');
    drawSummaryCard(margin + (cardW + cardGap) * 3, 'Closing', fmtMoney(report.summary.closingBalance), report.summary.closingBalance > 0 ? 'warn' : 'positive');
    y += 52;
    const colX = {
        date: margin + 4,
        type: margin + 100,
        ref: margin + 168,
        desc: margin + 282,
        debit: margin + contentW - 196,
        credit: margin + contentW - 130,
        balance: margin + contentW - 64,
    };
    const colW = {
        date: 90,
        type: 60,
        ref: 106,
        desc: 300,
        debit: 62,
        credit: 62,
        balance: 60,
    };
    const drawHeader = () => {
        doc.save();
        doc.roundedRect(margin, y, contentW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('DATE', colX.date, y + 6, { width: colW.date });
        doc.text('TYPE', colX.type, y + 6, { width: colW.type });
        doc.text('REFERENCE', colX.ref, y + 6, { width: colW.ref });
        doc.text('DESCRIPTION', colX.desc, y + 6, { width: colW.desc });
        doc.text('DEBIT', colX.debit, y + 6, { width: colW.debit, align: 'right' });
        doc.text('CREDIT', colX.credit, y + 6, { width: colW.credit, align: 'right' });
        doc.text('BALANCE', colX.balance, y + 6, { width: colW.balance, align: 'right' });
        y += 20;
    };
    drawHeader();
    let rowIndex = 0;
    report.lines.slice(0, 400).forEach((line) => {
        const lineDate = String(line.date || '—');
        const type = String(line.type || '—');
        const reference = String(line.reference || '—');
        const description = String(line.description || '—');
        const debit = line.debit ? fmtMoney(line.debit) : '—';
        const credit = line.credit ? fmtMoney(line.credit) : '—';
        const balance = fmtMoney(line.balance || 0);
        doc.font('Helvetica').fontSize(8);
        const rowH = Math.max(17, Math.ceil(Math.max(doc.heightOfString(lineDate, { width: colW.date }), doc.heightOfString(typeLabel(type), { width: colW.type - 14 }), doc.heightOfString(reference, { width: colW.ref }), doc.heightOfString(description, { width: colW.desc }), doc.heightOfString(debit, { width: colW.debit, align: 'right' }), doc.heightOfString(credit, { width: colW.credit, align: 'right' }), doc.heightOfString(balance, { width: colW.balance, align: 'right' }))) + 7);
        if (y + rowH > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawHeader();
        }
        if (rowIndex % 2 === 1) {
            doc.save();
            doc.rect(margin, y, contentW, rowH).fill('#f8fafc');
            doc.restore();
        }
        doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
        doc.text(lineDate, colX.date, y + 4, { width: colW.date });
        const pillX = colX.type;
        const pillY = y + 4;
        const pillW = Math.min(colW.type - 6, Math.max(32, doc.widthOfString(typeLabel(type)) + 12));
        const pillTone = type === 'payment' ? '#dcfce7' : type === 'invoice' ? '#fee2e2' : '#e0e7ff';
        const pillText = type === 'payment' ? '#166534' : type === 'invoice' ? '#991b1b' : '#3730a3';
        doc.save();
        doc.roundedRect(pillX, pillY, pillW, 11, 5).fill(pillTone);
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor(pillText).text(typeLabel(type), pillX + 6, pillY + 2, {
            width: pillW - 10,
            lineBreak: false,
        });
        doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
        doc.text(reference, colX.ref, y + 4, { width: colW.ref });
        doc.text(description, colX.desc, y + 4, { width: colW.desc });
        doc.text(debit, colX.debit, y + 4, { width: colW.debit, align: 'right' });
        doc.text(credit, colX.credit, y + 4, { width: colW.credit, align: 'right' });
        doc.font('Helvetica-Bold').text(balance, colX.balance, y + 4, { width: colW.balance, align: 'right' });
        y += rowH;
        rowIndex += 1;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
router.get('/reports/outstanding-invoices', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (_req, res) => {
    const data = await (0, fin_reports_service_1.buildOutstandingInvoicesReport)();
    res.json(data);
});
router.post('/terms/:termId/carry-forward-balances', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const result = await (0, term_balance_service_1.carryForwardBalancesForTerm)(req.params.termId);
        res.json({
            message: `Carry-forward balances initialized for ${result.studentsProcessed} students.`,
            ...result,
        });
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to carry forward balances' });
    }
});
router.get('/students/:studentId/term-balance/:termId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    try {
        const summary = await (0, term_balance_service_1.getTermBalanceSummary)(req.params.studentId, req.params.termId);
        res.json(summary);
    }
    catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to load term balance' });
    }
});
router.get('/reports/outstanding-invoices/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const data = await (0, fin_reports_service_1.buildOutstandingInvoicesReport)();
    const inline = String(req.query.preview || '') === 'true';
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="outstanding-invoices-report.pdf"`);
        res.send(pdf);
    });
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Outstanding Invoices Report', { margin });
    y = Math.max(y, doc.y + 2);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    doc.text(`Classes: ${data.groups.length}   Students: ${data.studentCount}   Invoices: ${data.invoiceCount}`, margin, y);
    y += 13;
    doc.font('Helvetica-Bold').text(`Grand total outstanding: $${Number(data.grandTotal || 0).toFixed(2)}`, margin, y);
    y += 16;
    const colX = {
        sid: margin + 4,
        student: margin + 86,
        invoice: margin + 252,
        due: margin + 364,
        desc: margin + 448,
        bal: margin + contentW - 94,
    };
    const colW = {
        sid: 78,
        student: 160,
        invoice: 104,
        due: 78,
        desc: 176,
        bal: 90,
    };
    const formatShortDate = (value) => {
        if (!value)
            return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime()))
            return value;
        const pad2 = (n) => String(n).padStart(2, '0');
        return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    };
    const drawTableHeader = () => {
        doc.save();
        doc.roundedRect(margin, y, contentW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('STUDENT ID', colX.sid, y + 6, { width: colW.sid });
        doc.text('STUDENT', colX.student, y + 6, { width: colW.student });
        doc.text('INVOICE #', colX.invoice, y + 6, { width: colW.invoice });
        doc.text('DUE DATE', colX.due, y + 6, { width: colW.due });
        doc.text('DESCRIPTION', colX.desc, y + 6, { width: colW.desc });
        doc.text('BALANCE', colX.bal, y + 6, { width: colW.bal, align: 'right' });
        y += 20;
    };
    drawTableHeader();
    let rowIndex = 0;
    data.groups.forEach((group) => {
        if (y + 28 > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawTableHeader();
        }
        const className = String(group.className || '').trim();
        const groupLabel = className
            ? (/^class\s+/i.test(className) ? className : `Class ${className}`)
            : 'Class —';
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
        doc.text(`${groupLabel}  •  Outstanding: $${Number(group.classTotal || 0).toFixed(2)}`, margin, y + 2);
        y += 14;
        group.students.forEach((student) => {
            const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
            student.invoices.forEach((inv) => {
                const admissionNumber = String(student.admissionNumber || '—');
                const invoiceNumber = String(inv.invoiceNumber || '—');
                const dueDate = formatShortDate(inv.dueDate);
                const description = String(inv.description || '—');
                const balanceText = `$${Number(inv.balance || 0).toFixed(2)}`;
                doc.font('Helvetica').fontSize(8);
                const rowH = Math.max(17, Math.ceil(Math.max(doc.heightOfString(admissionNumber, { width: colW.sid }), doc.heightOfString(studentName || '—', { width: colW.student }), doc.heightOfString(invoiceNumber, { width: colW.invoice }), doc.heightOfString(dueDate, { width: colW.due }), doc.heightOfString(description, { width: colW.desc }), doc.heightOfString(balanceText, { width: colW.bal, align: 'right' }))) + 7);
                if (y + rowH > pageBottom()) {
                    doc.addPage({ size: 'A4', layout: 'landscape', margin });
                    y = margin;
                    drawTableHeader();
                }
                if (rowIndex % 2 === 1) {
                    doc.save();
                    doc.rect(margin, y, contentW, rowH).fill('#f8fafc');
                    doc.restore();
                }
                doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
                doc.text(admissionNumber, colX.sid, y + 4, { width: colW.sid });
                doc.text(studentName || '—', colX.student, y + 4, { width: colW.student });
                doc.text(invoiceNumber, colX.invoice, y + 4, { width: colW.invoice });
                doc.text(dueDate, colX.due, y + 4, { width: colW.due });
                doc.text(description, colX.desc, y + 4, { width: colW.desc });
                doc.font('Helvetica-Bold').text(balanceText, colX.bal, y + 4, { width: colW.bal, align: 'right' });
                y += rowH;
                rowIndex += 1;
            });
        });
        y += 6;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
function reconciliationQueryParams(req) {
    return {
        dateFrom: String(req.query.dateFrom || '').trim() || undefined,
        dateTo: String(req.query.dateTo || '').trim() || undefined,
        termId: String(req.query.termId || '').trim() || undefined,
        formId: String(req.query.formId || '').trim() || undefined,
        classId: String(req.query.classId || '').trim() || undefined,
        studentId: String(req.query.studentId || '').trim() || undefined,
        q: String(req.query.q || '').trim() || undefined,
        feeType: String(req.query.feeType || '').trim() || undefined,
        detailed: req.query.detailed !== 'false',
    };
}
router.get('/reports/student-reconciliation', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const result = await (0, fin_reports_service_1.buildStudentReconciliationReport)(reconciliationQueryParams(req));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.json(result);
    res.json(result);
});
router.get('/reports/student-reconciliation/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const detailed = req.query.mode !== 'summary';
    const inline = String(req.query.preview || '') === 'true';
    const result = await (0, fin_reports_service_1.buildStudentReconciliationReport)({
        ...reconciliationQueryParams(req),
        detailed,
    });
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result) {
        return res.status(400).json({ message: 'Multiple students match — select one student before exporting' });
    }
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const pdf = await (0, pdf_2.generateReconciliationPdf)({
        ...branding,
        dateFrom: result.filters.dateFrom,
        dateTo: result.filters.dateTo,
        termName: result.filters.termName,
        generatedAt: result.generatedAt,
        summary: result.summary,
        detailed,
        rows: result.students.map((r) => ({
            admissionNumber: r.student.admissionNumber,
            name: `${r.student.firstName} ${r.student.lastName}`,
            classLabel: (() => {
                const cls = String(r.student.className || '').trim();
                if (!cls)
                    return 'Class —';
                return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
            })(),
            status: r.status,
            totalBilled: r.studentModule.totalBilled,
            totalCollected: r.studentModule.totalCollected,
            closingBalance: r.studentModule.closingBalance,
            outstandingBalance: r.studentModule.outstandingBalance,
            variance: r.variance.closingBalanceVariance,
            discrepancies: r.discrepancies,
        })),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="student-reconciliation-${detailed ? 'detailed' : 'summary'}.pdf"`);
    res.send(pdf);
});
router.get('/reports/student-reconciliation/export.xlsx', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const detailed = req.query.mode !== 'summary';
    const result = await (0, fin_reports_service_1.buildStudentReconciliationReport)({
        ...reconciliationQueryParams(req),
        detailed,
    });
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result) {
        return res.status(400).json({ message: 'Multiple students match — select one student before exporting' });
    }
    const csv = (0, fin_reports_service_1.reconciliationReportToCsv)(result, detailed);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="student-reconciliation-${detailed ? 'detailed' : 'summary'}.csv"`);
    res.send(csv);
});
function debtorAgingQueryParams(req) {
    return {
        dateFrom: String(req.query.dateFrom || '').trim() || undefined,
        dateTo: String(req.query.dateTo || '').trim() || undefined,
        termId: String(req.query.termId || '').trim() || undefined,
        formId: String(req.query.formId || '').trim() || undefined,
        classId: String(req.query.classId || '').trim() || undefined,
        studentId: String(req.query.studentId || '').trim() || undefined,
        q: String(req.query.q || '').trim() || undefined,
        feeType: String(req.query.feeType || '').trim() || undefined,
        agingBucket: String(req.query.agingBucket || '').trim() || undefined,
        excludeZeroBalances: req.query.excludeZeroBalances !== 'false',
        escalationDays: Number(req.query.escalationDays || 90),
    };
}
router.get('/reports/debtor-aging', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const result = await (0, fin_reports_service_1.buildDebtorAgingReport)(debtorAgingQueryParams(req));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.json(result);
    res.json(result);
});
router.get('/reports/debtor-aging/export.xlsx', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const detailed = req.query.mode !== 'summary';
    const result = await (0, fin_reports_service_1.buildDebtorAgingReport)(debtorAgingQueryParams(req));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.status(400).json({ message: 'Multiple students match — select one before export' });
    const csv = (0, fin_reports_service_1.debtorAgingToCsv)(result, detailed);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="debtor-aging-${detailed ? 'detailed' : 'summary'}.csv"`);
    res.send(csv);
});
router.get('/reports/debtor-aging/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const detailed = req.query.mode !== 'summary';
    const inline = String(req.query.preview || '') === 'true';
    const result = await (0, fin_reports_service_1.buildDebtorAgingReport)(debtorAgingQueryParams(req));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.status(400).json({ message: 'Multiple students match — select one before export' });
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="debtor-aging-${detailed ? 'detailed' : 'summary'}.pdf"`);
        res.send(pdf);
    });
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    const money = (n) => `$${Number(n || 0).toFixed(2)}`;
    const classLabel = (s) => {
        const cls = String(s.className || '').trim();
        if (!cls)
            return 'Class —';
        return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
    };
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Debtor Aging Report', { margin });
    y = Math.max(doc.y + 2, y);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    doc.text(`Period: ${result.filters.dateFrom || 'Start'} to ${result.filters.dateTo}${result.filters.termName ? `   Term: ${result.filters.termName}` : ''}`, margin, y);
    y += 14;
    const gap = 8;
    const cardW = (contentW - gap * 3) / 4;
    const drawCard = (x, label, value, tone = 'neutral') => {
        const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : tone === 'danger' ? '#fef2f2' : '#eff6ff';
        const border = tone === 'positive' ? '#86efac' : tone === 'warn' ? '#fdba74' : tone === 'danger' ? '#fecaca' : '#bfdbfe';
        const fg = tone === 'positive' ? '#166534' : tone === 'warn' ? '#9a3412' : tone === 'danger' ? '#991b1b' : '#1d4ed8';
        doc.save();
        doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x + 9, y + 8, { width: cardW - 18 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
    };
    drawCard(margin, 'Debtors', String(result.summary.totalDebtors), 'neutral');
    drawCard(margin + cardW + gap, 'Outstanding', money(result.summary.totalOutstanding), 'danger');
    drawCard(margin + (cardW + gap) * 2, 'Collected %', `${result.summary.collectedPct.toFixed(2)}%`, 'positive');
    drawCard(margin + (cardW + gap) * 3, '120+ Bucket', money(result.summary.byBucket['120_plus']), 'warn');
    y += 52;
    const cols = detailed
        ? [
            { label: 'ID', w: 70 },
            { label: 'Student', w: 132 },
            { label: 'Class', w: 88 },
            { label: 'Status', w: 84 },
            { label: 'Outstanding', w: 82, align: 'right' },
            { label: '120+', w: 64, align: 'right' },
            { label: 'Guardian', w: 150 },
            { label: 'Last Payment', w: 84 },
            { label: 'Escalate', w: 62 },
        ]
        : [
            { label: 'ID', w: 80 },
            { label: 'Student', w: 190 },
            { label: 'Class', w: 110 },
            { label: 'Status', w: 96 },
            { label: 'Outstanding', w: 100, align: 'right' },
            { label: '120+', w: 80, align: 'right' },
            { label: 'Last Payment', w: 90 },
        ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const drawHeader = () => {
        let x = margin;
        doc.save();
        doc.roundedRect(margin, y, tableW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        for (const c of cols) {
            doc.text(c.label, x + 4, y + 6, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
            x += c.w;
        }
        y += 20;
    };
    drawHeader();
    let rowIndex = 0;
    result.students.slice(0, detailed ? 180 : 120).forEach((s) => {
        const status = String(s.accountStatus || '').toUpperCase();
        const values = detailed
            ? [
                s.admissionNumber || '—',
                `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—',
                classLabel(s),
                status,
                money(s.outstandingBalance),
                money(s.aging['120_plus']),
                `${s.guardianName || 'N/A'}${s.guardianPhone ? ` (${s.guardianPhone})` : ''}`,
                s.lastPaymentDate || '—',
                s.escalationFlag ? 'Yes' : 'No',
            ]
            : [
                s.admissionNumber || '—',
                `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—',
                classLabel(s),
                status,
                money(s.outstandingBalance),
                money(s.aging['120_plus']),
                s.lastPaymentDate || '—',
            ];
        doc.font('Helvetica').fontSize(8);
        let rowH = 0;
        for (let i = 0; i < cols.length; i++) {
            if (cols[i].label === 'Status')
                continue;
            rowH = Math.max(rowH, doc.heightOfString(String(values[i]), { width: cols[i].w - 8, align: cols[i].align || 'left' }));
        }
        rowH = Math.max(17, Math.ceil(rowH) + 6);
        if (y + rowH > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawHeader();
        }
        if (rowIndex % 2 === 1) {
            doc.save();
            doc.rect(margin, y, tableW, rowH).fill('#f8fafc');
            doc.restore();
        }
        let x = margin;
        for (let i = 0; i < cols.length; i++) {
            if (cols[i].label === 'Status') {
                const bg = status === 'RECONCILED' ? '#dcfce7' : status === 'UNRECONCILED' ? '#fee2e2' : '#fef3c7';
                const fg = status === 'RECONCILED' ? '#166534' : status === 'UNRECONCILED' ? '#991b1b' : '#92400e';
                const pillW = Math.min(cols[i].w - 10, Math.max(42, doc.widthOfString(status) + 14));
                const pillY = y + Math.max(3, Math.floor((rowH - 11) / 2));
                doc.save();
                doc.roundedRect(x + 4, pillY, pillW, 11, 5).fill(bg);
                doc.restore();
                doc.font('Helvetica-Bold').fontSize(6.7).fillColor(fg).text(status, x + 8, pillY + 2, { width: pillW - 8, align: 'center', lineBreak: false });
                doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
            }
            else {
                doc.text(String(values[i]), x + 4, y + 3, { width: cols[i].w - 8, align: cols[i].align || 'left' });
            }
            x += cols[i].w;
        }
        y += rowH;
        rowIndex += 1;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
router.post('/reports/debtor-aging/notes', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const { studentId, note } = req.body || {};
    if (!studentId || !String(note || '').trim())
        return res.status(400).json({ message: 'studentId and note are required' });
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const saved = await notifRepo.save(notifRepo.create({
        userId: req.user.userId,
        title: 'Debtor Follow-up Note',
        message: String(note).trim(),
        type: 'debtor_note',
        metadata: { studentId, createdBy: req.user.userId },
    }));
    res.status(201).json(saved);
});
router.get('/reports/debtor-aging/notes/:studentId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const rows = await data_source_1.AppDataSource.getRepository(entities_1.Notification).find({
        where: { type: 'debtor_note' },
        order: { createdAt: 'DESC' },
    });
    res.json(rows.filter((r) => r.metadata?.studentId === req.params.studentId));
});
function feeCollectionQueryParams(req, summaryOnly = false) {
    return {
        dateFrom: String(req.query.dateFrom || '').trim() || undefined,
        dateTo: String(req.query.dateTo || '').trim() || undefined,
        termId: String(req.query.termId || '').trim() || undefined,
        formId: String(req.query.formId || '').trim() || undefined,
        classId: String(req.query.classId || '').trim() || undefined,
        studentId: String(req.query.studentId || '').trim() || undefined,
        q: String(req.query.q || '').trim() || undefined,
        feeType: String(req.query.feeType || '').trim() || undefined,
        paymentMethod: String(req.query.paymentMethod || '').trim() || undefined,
        collectionStatus: String(req.query.collectionStatus || '').trim(),
        compareDateFrom: String(req.query.compareDateFrom || '').trim() || undefined,
        compareDateTo: String(req.query.compareDateTo || '').trim() || undefined,
        compareTermId: String(req.query.compareTermId || '').trim() || undefined,
        summaryOnly,
    };
}
router.get('/reports/fee-collection-revenue', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const summaryOnly = req.user.role === enums_1.UserRole.PRINCIPAL;
    const result = await (0, fee_collection_revenue_service_1.buildFeeCollectionRevenueReport)(feeCollectionQueryParams(req, summaryOnly));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.json(result);
    res.json({ ...result, accessLevel: summaryOnly ? 'summary' : 'full' });
});
router.get('/reports/fee-collection-revenue/export.xlsx', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const summaryOnly = req.user.role === enums_1.UserRole.PRINCIPAL;
    const detailed = !summaryOnly && req.query.mode !== 'summary';
    const result = await (0, fee_collection_revenue_service_1.buildFeeCollectionRevenueReport)(feeCollectionQueryParams(req, summaryOnly));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.status(400).json({ message: 'Multiple students match — select one before export' });
    const csv = (0, fee_collection_revenue_service_1.feeCollectionReportToCsv)(result, detailed);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fee-collection-revenue-${detailed ? 'detailed' : 'summary'}.csv"`);
    res.send(csv);
});
router.get('/reports/fee-collection-revenue/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const summaryOnly = req.user.role === enums_1.UserRole.PRINCIPAL;
    const detailed = !summaryOnly && req.query.mode !== 'summary';
    const inline = String(req.query.preview || '') === 'true';
    const result = await (0, fee_collection_revenue_service_1.buildFeeCollectionRevenueReport)(feeCollectionQueryParams(req, summaryOnly));
    if ('error' in result)
        return res.status(400).json({ message: result.error });
    if ('needsSelection' in result)
        return res.status(400).json({ message: 'Multiple students match — select one before export' });
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="fee-collection-revenue-${detailed ? 'detailed' : 'summary'}.pdf"`);
        res.send(pdf);
    });
    const o = result.overview;
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    const money = (n) => `$${Number(n || 0).toFixed(2)}`;
    const classLabel = (raw) => {
        const cls = String(raw || '').trim();
        if (!cls)
            return 'Class —';
        return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
    };
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Fee Collection & Revenue Report', { margin });
    y = Math.max(doc.y + 2, y);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    doc.text(`Period: ${result.filters.dateFrom} to ${result.filters.dateTo}${result.filters.termName ? `   Term: ${result.filters.termName}` : ''}`, margin, y);
    y += 14;
    const gap = 8;
    const cardW = (contentW - gap * 3) / 4;
    const drawCard = (x, label, value, tone = 'neutral') => {
        const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : tone === 'danger' ? '#fef2f2' : '#eff6ff';
        const border = tone === 'positive' ? '#86efac' : tone === 'warn' ? '#fdba74' : tone === 'danger' ? '#fecaca' : '#bfdbfe';
        const fg = tone === 'positive' ? '#166534' : tone === 'warn' ? '#9a3412' : tone === 'danger' ? '#991b1b' : '#1d4ed8';
        doc.save();
        doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x + 9, y + 8, { width: cardW - 18 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
    };
    drawCard(margin, 'Expected', money(o.totalExpected), 'neutral');
    drawCard(margin + cardW + gap, 'Collected', money(o.totalCollected), 'positive');
    drawCard(margin + (cardW + gap) * 2, 'Outstanding', money(o.totalOutstanding), 'danger');
    drawCard(margin + (cardW + gap) * 3, 'Collection Rate', `${Number(o.collectionRatePct || 0).toFixed(1)}%`, 'warn');
    y += 52;
    if (result.compareOverview) {
        const c = result.compareOverview;
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(`Compare Period — Expected ${money(c.totalExpected)}  Collected ${money(c.totalCollected)}  Rate ${Number(c.collectionRatePct || 0).toFixed(1)}%`, margin, y);
        y += 12;
    }
    const cols = [
        { label: 'GRADE', w: 120 },
        { label: 'CLASS', w: 150 },
        { label: 'STUDENTS', w: 72, align: 'right' },
        { label: 'EXPECTED', w: 106, align: 'right' },
        { label: 'COLLECTED', w: 106, align: 'right' },
        { label: 'OUTSTANDING', w: 106, align: 'right' },
        { label: 'RATE %', w: 80, align: 'right' },
    ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const drawHeader = () => {
        let x = margin;
        doc.save();
        doc.roundedRect(margin, y, tableW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        for (const c of cols) {
            doc.text(c.label, x + 4, y + 6, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
            x += c.w;
        }
        y += 20;
    };
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Collection by Grade / Class', margin, y);
    y += 14;
    drawHeader();
    let rowIndex = 0;
    (result.byGradeClass || []).slice(0, detailed ? 180 : 120).forEach((g) => {
        const vals = [
            String(g.gradeLabel || '—'),
            classLabel(String(g.classLabel || '')),
            String(g.studentCount ?? 0),
            money(Number(g.totalExpected || 0)),
            money(Number(g.totalCollected || 0)),
            money(Number(g.outstanding || 0)),
            `${Number(g.collectionRatePct || 0).toFixed(1)}%`,
        ];
        doc.font('Helvetica').fontSize(8);
        let rowH = 0;
        for (let i = 0; i < cols.length; i++) {
            rowH = Math.max(rowH, doc.heightOfString(vals[i], { width: cols[i].w - 8, align: cols[i].align || 'left' }));
        }
        rowH = Math.max(17, Math.ceil(rowH) + 6);
        if (y + rowH > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawHeader();
        }
        if (rowIndex % 2 === 1) {
            doc.save();
            doc.rect(margin, y, tableW, rowH).fill('#f8fafc');
            doc.restore();
        }
        doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
        let x = margin;
        for (let i = 0; i < cols.length; i++) {
            doc.text(vals[i], x + 4, y + 3, { width: cols[i].w - 8, align: cols[i].align || 'left' });
            x += cols[i].w;
        }
        y += rowH;
        rowIndex += 1;
    });
    y += 10;
    if (y + 120 > pageBottom()) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        y = margin;
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('By Fee Category', margin, y);
    y += 14;
    (result.byCategory || []).slice(0, 10).forEach((c, idx) => {
        const line = `${String(c.label || '—')}: expected ${money(Number(c.expected || 0))}   collected ${money(Number(c.collected || 0))}   outstanding ${money(Number(c.outstanding || 0))}   rate ${Number(c.collectionRatePct || 0).toFixed(1)}%`;
        const h = Math.max(12, Math.ceil(doc.heightOfString(line, { width: contentW - 8 })) + 3);
        if (y + h > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
        }
        if (idx % 2 === 1) {
            doc.save();
            doc.rect(margin, y - 1, contentW, h).fill('#f8fafc');
            doc.restore();
        }
        doc.font('Helvetica').fontSize(8).fillColor('#0f172a').text(line, margin + 4, y, { width: contentW - 8 });
        y += h;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
router.post('/reports/fee-collection-revenue/schedule', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR), async (req, res) => {
    const { frequency, emails, mode } = req.body || {};
    const freq = String(frequency || '').toLowerCase();
    if (!['daily', 'weekly', 'monthly'].includes(freq)) {
        return res.status(400).json({ message: 'frequency must be daily, weekly, or monthly' });
    }
    const recipients = String(emails || '')
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean);
    if (!recipients.length)
        return res.status(400).json({ message: 'At least one email recipient is required' });
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const saved = await notifRepo.save(notifRepo.create({
        userId: req.user.userId,
        title: 'Fee Collection Report Schedule',
        message: `Scheduled ${freq} ${mode || 'summary'} report to ${recipients.join(', ')}`,
        type: 'fee_collection_schedule',
        metadata: { frequency: freq, emails: recipients, mode: mode || 'summary', createdBy: req.user.userId },
    }));
    res.status(201).json({ message: 'Report schedule saved. Delivery runs when email (SMTP) is configured.', schedule: saved });
});
router.post('/reports/debtor-aging/write-off', (0, auth_1.authorize)(enums_1.UserRole.ADMIN), async (req, res) => {
    const { studentId, reason, approvedBy } = req.body || {};
    if (!studentId || !String(reason || '').trim() || !String(approvedBy || '').trim()) {
        return res.status(400).json({ message: 'studentId, reason, and approvedBy are required' });
    }
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const ledgerRepo = data_source_1.AppDataSource.getRepository(entities_1.LedgerEntry);
    const notifRepo = data_source_1.AppDataSource.getRepository(entities_1.Notification);
    const invoices = await invoiceRepo.find({ where: { studentId } });
    let totalWrittenOff = 0;
    for (const inv of invoices) {
        const due = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid));
        if (due <= 0.005)
            continue;
        inv.amountPaid = Number(inv.totalAmount);
        inv.status = enums_1.InvoiceStatus.CANCELLED;
        await invoiceRepo.save(inv);
        totalWrittenOff += due;
    }
    if (totalWrittenOff > 0) {
        const last = await ledgerRepo.findOne({ where: { studentId }, order: { createdAt: 'DESC' } });
        await ledgerRepo.save(ledgerRepo.create({
            studentId,
            entryDate: (0, helpers_1.today)(),
            description: `Debt write-off approved by ${approvedBy}: ${reason}`,
            debit: 0,
            credit: totalWrittenOff,
            balance: Number(last?.balance || 0) - totalWrittenOff,
            referenceType: 'writeoff',
            referenceId: studentId,
        }));
    }
    await notifRepo.save(notifRepo.create({
        userId: req.user.userId,
        title: 'Debt Write-off',
        message: `Write-off of $${totalWrittenOff.toFixed(2)} approved by ${approvedBy}. Reason: ${reason}`,
        type: 'debt_writeoff',
        metadata: { studentId, approvedBy, reason, totalWrittenOff },
    }));
    res.json({ studentId, totalWrittenOff });
});
router.get('/reports/debtor-aging/reminder-letter.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const studentId = String(req.query.studentId || '').trim();
    if (!studentId)
        return res.status(400).json({ message: 'studentId is required' });
    const report = await (0, fin_reports_service_1.buildDebtorAgingReport)({ studentId, dateTo: (0, helpers_1.today)(), excludeZeroBalances: false });
    if ('error' in report || 'needsSelection' in report || !report.students.length) {
        return res.status(404).json({ message: 'Student debtor record not found' });
    }
    const s = report.students[0];
    const doc = new pdfkit_1.default({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="fee-reminder-${s.admissionNumber}.pdf"`);
        res.send(pdf);
    });
    await renderPdfHeaderWithLogo(doc, 'Fee Reminder Letter', { margin: 48 });
    doc.moveDown(0.7);
    doc.fontSize(11).text(`Student: ${s.firstName} ${s.lastName} (${s.admissionNumber})`);
    doc.text(`Class: ${s.formName || ''} ${s.className || ''}`);
    doc.text(`Guardian: ${s.guardianName || 'N/A'}  Phone: ${s.guardianPhone || 'N/A'}`);
    doc.moveDown(0.6);
    doc.text(`Outstanding balance: $${s.outstandingBalance.toFixed(2)}`);
    doc.text(`Current: $${s.aging.current.toFixed(2)} | 31-60: $${s.aging['31_60'].toFixed(2)} | 61-90: $${s.aging['61_90'].toFixed(2)} | 91-120: $${s.aging['91_120'].toFixed(2)} | 120+: $${s.aging['120_plus'].toFixed(2)}`);
    doc.moveDown(0.9);
    doc.text('Dear Parent/Guardian,');
    doc.text('This is a reminder that the above student account has outstanding school fees. Kindly settle the balance or contact the finance office to agree a payment plan.');
    doc.moveDown(1.2);
    doc.text('Finance Office');
    renderGeneratedFooter(doc, new Date(), 48);
    doc.end();
});
async function fetchStudentBalances(rawQ) {
    const q = `%${rawQ.replace(/\s+/g, '%')}%`;
    const result = await data_source_1.AppDataSource.query(`
      SELECT
        s.id,
        s."admissionNumber",
        s."firstName",
        s."lastName",
        c.name as "className",
        COALESCE(inv."totalInvoiced", 0) as "totalInvoiced",
        COALESCE(pay."totalPaid", 0) as "totalPaid",
        COALESCE(inv."totalInvoiced", 0) - COALESCE(pay."totalPaid", 0) as balance
      FROM students s
      LEFT JOIN classes c ON c.id = s."classId"
      LEFT JOIN (
        SELECT "studentId", COALESCE(SUM("totalAmount"), 0) as "totalInvoiced"
        FROM invoices
        GROUP BY "studentId"
      ) inv ON inv."studentId" = s.id
      LEFT JOIN (
        SELECT "studentId", COALESCE(SUM(amount), 0) as "totalPaid"
        FROM payments
        GROUP BY "studentId"
      ) pay ON pay."studentId" = s.id
      WHERE
        s."isActive" = true
        AND (
          s.id::text = $1
          OR s."admissionNumber" ILIKE $2
          OR s."firstName" ILIKE $2
          OR s."lastName" ILIKE $2
          OR CONCAT(s."firstName", ' ', s."lastName") ILIKE $2
        )
      GROUP BY s.id, c.name, inv."totalInvoiced", pay."totalPaid"
      ORDER BY balance DESC, s."lastName" ASC, s."firstName" ASC
      LIMIT 20
    `, [rawQ, q]);
    return result.map((r) => ({
        ...r,
        totalInvoiced: Number(r.totalInvoiced || 0),
        totalPaid: Number(r.totalPaid || 0),
        balance: Number(r.balance || 0),
    }));
}
router.get('/student-balance', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const rawQ = String(req.query.q || '').trim();
    if (!rawQ) {
        return res.status(400).json({ message: 'Query is required' });
    }
    res.json(await fetchStudentBalances(rawQ));
});
router.get('/student-balance/export.pdf', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const rawQ = String(req.query.q || '').trim();
    if (!rawQ)
        return res.status(400).json({ message: 'Query is required' });
    const rows = await fetchStudentBalances(rawQ);
    if (!rows.length)
        return res.status(404).json({ message: 'No matching student found' });
    const inline = String(req.query.preview || '') === 'true';
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape', margin: 34 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="student-balance-report.pdf"`);
        res.send(pdf);
    });
    const margin = 34;
    const contentW = doc.page.width - margin * 2;
    const pageBottom = () => doc.page.height - margin - 20;
    const money = (n) => `$${Number(n || 0).toFixed(2)}`;
    const classLabel = (raw) => {
        const cls = String(raw || '').trim();
        if (!cls)
            return 'Class —';
        return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
    };
    let y = margin;
    await renderPdfHeaderWithLogo(doc, 'Student Balance Report', { margin });
    y = Math.max(doc.y + 2, y);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    doc.text(`Search: ${rawQ}`, margin, y);
    y += 14;
    const totalInvoiced = rows.reduce((s, r) => s + r.totalInvoiced, 0);
    const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const gap = 8;
    const cardW = (contentW - gap * 2) / 3;
    const drawCard = (x, label, value, tone = 'neutral') => {
        const bg = tone === 'positive' ? '#ecfdf3' : tone === 'warn' ? '#fff7ed' : '#eff6ff';
        const border = tone === 'positive' ? '#86efac' : tone === 'warn' ? '#fdba74' : '#bfdbfe';
        const fg = tone === 'positive' ? '#166534' : tone === 'warn' ? '#9a3412' : '#1d4ed8';
        doc.save();
        doc.roundedRect(x, y, cardW, 42, 7).fillAndStroke(bg, border);
        doc.restore();
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(label.toUpperCase(), x + 9, y + 8, { width: cardW - 18 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(fg).text(value, x + 9, y + 21, { width: cardW - 18 });
    };
    drawCard(margin, 'Students', String(rows.length), 'neutral');
    drawCard(margin + cardW + gap, 'Total Invoiced', money(totalInvoiced), 'neutral');
    drawCard(margin + (cardW + gap) * 2, 'Outstanding', money(totalBalance), 'warn');
    y += 52;
    const cols = [
        { label: 'STUDENT ID', w: 90 },
        { label: 'NAME', w: 150 },
        { label: 'CLASS', w: 100 },
        { label: 'INVOICED', w: 100, align: 'right' },
        { label: 'PAID', w: 100, align: 'right' },
        { label: 'BALANCE', w: 100, align: 'right' },
    ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const drawHeader = () => {
        let x = margin;
        doc.save();
        doc.roundedRect(margin, y, tableW, 18, 5).fill('#1e40af');
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        for (const c of cols) {
            doc.text(c.label, x + 4, y + 6, { width: c.w - 8, align: c.align || 'left', lineBreak: false });
            x += c.w;
        }
        y += 20;
    };
    drawHeader();
    let rowIndex = 0;
    rows.forEach((r) => {
        const vals = [
            String(r.admissionNumber || r.id || '—'),
            `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—',
            classLabel(r.className || ''),
            money(r.totalInvoiced),
            money(r.totalPaid),
            money(r.balance),
        ];
        doc.font('Helvetica').fontSize(8);
        let rowH = 0;
        for (let i = 0; i < cols.length; i++) {
            rowH = Math.max(rowH, doc.heightOfString(vals[i], { width: cols[i].w - 8, align: cols[i].align || 'left' }));
        }
        rowH = Math.max(17, Math.ceil(rowH) + 6);
        if (y + rowH > pageBottom()) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin });
            y = margin;
            drawHeader();
        }
        if (rowIndex % 2 === 1) {
            doc.save();
            doc.rect(margin, y, tableW, rowH).fill('#f8fafc');
            doc.restore();
        }
        doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
        let x = margin;
        for (let i = 0; i < cols.length; i++) {
            if (i === cols.length - 1 && r.balance > 0)
                doc.font('Helvetica-Bold');
            doc.text(vals[i], x + 4, y + 3, { width: cols[i].w - 8, align: cols[i].align || 'left' });
            if (i === cols.length - 1 && r.balance > 0)
                doc.font('Helvetica');
            x += cols[i].w;
        }
        y += rowH;
        rowIndex += 1;
    });
    renderGeneratedFooter(doc, new Date(), margin);
    doc.end();
});
router.get('/class-balances/:classId', (0, auth_1.authorize)(enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL), async (req, res) => {
    const result = await data_source_1.AppDataSource.query(`
    SELECT COALESCE(SUM(i."totalAmount" - i."amountPaid"), 0) as "totalOwed",
      COUNT(DISTINCT s.id) as "studentsWithBalance"
    FROM students s
    LEFT JOIN invoices i ON i."studentId" = s.id AND i.status IN ('sent', 'partial', 'overdue')
    WHERE s."classId" = $1 AND s."isActive" = true
  `, [req.params.classId]);
    res.json(result[0]);
});
exports.default = router;
