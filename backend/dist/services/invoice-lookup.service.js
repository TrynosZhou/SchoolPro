"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStudentInvoiceForLookup = resolveStudentInvoiceForLookup;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const term_balance_service_1 = require("./term-balance.service");
const UNPAID_STATUSES = [enums_1.InvoiceStatus.SENT, enums_1.InvoiceStatus.PARTIAL, enums_1.InvoiceStatus.OVERDUE];
function sortInvoicesNewestFirst(invoices) {
    return [...invoices].sort((a, b) => {
        const dateCmp = (b.issuedDate || b.dueDate || '').localeCompare(a.issuedDate || a.dueDate || '');
        if (dateCmp !== 0)
            return dateCmp;
        return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '');
    });
}
function pickBestInvoice(candidates) {
    if (!candidates.length)
        return null;
    const sorted = sortInvoicesNewestFirst(candidates);
    const unpaid = sorted.filter((inv) => UNPAID_STATUSES.includes(inv.status));
    return unpaid[0] ?? sorted[0] ?? null;
}
/** Pick the invoice PDF parents/admins expect: current-term fee invoice, not old terms or carry-forward rows. */
async function resolveStudentInvoiceForLookup(studentId) {
    const termRepo = data_source_1.AppDataSource.getRepository(entities_1.Term);
    const invoiceRepo = data_source_1.AppDataSource.getRepository(entities_1.Invoice);
    const currentTerm = await termRepo.findOne({ where: { isCurrent: true } });
    const all = await invoiceRepo.find({
        where: { studentId },
        relations: (0, typeorm_helpers_1.relations)('term'),
        order: { issuedDate: 'DESC', createdAt: 'DESC' },
    });
    const actionable = all.filter((inv) => inv.feeType !== term_balance_service_1.BALANCE_FORWARD_FEE_TYPE);
    if (!actionable.length)
        return null;
    if (currentTerm) {
        const inCurrentTerm = actionable.filter((inv) => inv.termId === currentTerm.id);
        const picked = pickBestInvoice(inCurrentTerm);
        if (picked)
            return picked;
    }
    return pickBestInvoice(actionable);
}
