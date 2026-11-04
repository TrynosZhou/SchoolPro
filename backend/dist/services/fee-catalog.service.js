"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCHOOL_FEES = void 0;
exports.normalizeFeeCode = normalizeFeeCode;
exports.ensureDefaultSchoolFees = ensureDefaultSchoolFees;
exports.countFeeCodeUsage = countFeeCodeUsage;
exports.isFeeCodeInUse = isFeeCodeInUse;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
exports.DEFAULT_SCHOOL_FEES = [
    { code: 'tuition', name: 'Tuition Fees', icon: '📚', sortOrder: 1, defaultAmount: 0, isActive: true },
    { code: 'bus_levy', name: 'Bus Levy', icon: '🚌', sortOrder: 2, defaultAmount: 0, isActive: true },
    { code: 'uniform', name: 'Uniform', icon: '👔', sortOrder: 3, defaultAmount: 0, isActive: true },
    { code: 'sports', name: 'Sports Levy', icon: '⚽', sortOrder: 4, defaultAmount: 0, isActive: true },
    { code: 'exam', name: 'Exam Fees', icon: '📝', sortOrder: 5, defaultAmount: 0, isActive: true },
    { code: 'tuckshop', name: 'Tuckshop', icon: '🍎', sortOrder: 6, defaultAmount: 0, isActive: true },
    { code: 'other', name: 'Other Levy', icon: '📋', sortOrder: 99, defaultAmount: 0, isActive: true },
];
function normalizeFeeCode(raw) {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 64);
}
async function ensureDefaultSchoolFees() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolFee);
    const count = await repo.count();
    if (count > 0)
        return;
    await repo.save(exports.DEFAULT_SCHOOL_FEES.map((f) => repo.create(f)));
}
async function countFeeCodeUsage(code) {
    const [invoices, payments] = await Promise.all([
        data_source_1.AppDataSource.getRepository(entities_1.Invoice).count({ where: { feeType: code } }),
        data_source_1.AppDataSource.getRepository(entities_1.Payment).count({ where: { feeType: code } }),
    ]);
    return { invoices, payments };
}
async function isFeeCodeInUse(code) {
    const { invoices, payments } = await countFeeCodeUsage(code);
    return invoices > 0 || payments > 0;
}
