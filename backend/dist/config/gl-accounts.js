"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CHART_OF_ACCOUNTS = exports.GL_ACCOUNT_CODES = void 0;
const enums_1 = require("../entities/enums");
/** Default chart-of-account codes seeded for school finance. */
exports.GL_ACCOUNT_CODES = {
    CASH_BANK: '1100',
    ACCOUNTS_RECEIVABLE: '1200',
    ACCOUNTS_PAYABLE: '2100',
    RETAINED_EARNINGS: '3100',
    TUITION_INCOME: '4100',
    TRANSPORT_INCOME: '4110',
    EXAM_INCOME: '4120',
    OTHER_INCOME: '4900',
    SALARY_EXPENSE: '5100',
    UTILITY_EXPENSE: '5200',
    MAINTENANCE_EXPENSE: '5300',
};
exports.DEFAULT_CHART_OF_ACCOUNTS = [
    { accountCode: exports.GL_ACCOUNT_CODES.CASH_BANK, accountName: 'Cash / Bank', accountType: enums_1.GlAccountType.ASSET },
    { accountCode: exports.GL_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, accountName: 'Accounts Receivable', accountType: enums_1.GlAccountType.ASSET },
    { accountCode: exports.GL_ACCOUNT_CODES.ACCOUNTS_PAYABLE, accountName: 'Accounts Payable', accountType: enums_1.GlAccountType.LIABILITY },
    { accountCode: exports.GL_ACCOUNT_CODES.RETAINED_EARNINGS, accountName: 'Retained Earnings', accountType: enums_1.GlAccountType.EQUITY },
    { accountCode: exports.GL_ACCOUNT_CODES.TUITION_INCOME, accountName: 'Tuition Income', accountType: enums_1.GlAccountType.REVENUE },
    { accountCode: exports.GL_ACCOUNT_CODES.TRANSPORT_INCOME, accountName: 'Transport Fee Income', accountType: enums_1.GlAccountType.REVENUE },
    { accountCode: exports.GL_ACCOUNT_CODES.EXAM_INCOME, accountName: 'Exam Fee Income', accountType: enums_1.GlAccountType.REVENUE },
    { accountCode: exports.GL_ACCOUNT_CODES.OTHER_INCOME, accountName: 'Other Income', accountType: enums_1.GlAccountType.REVENUE },
    { accountCode: exports.GL_ACCOUNT_CODES.SALARY_EXPENSE, accountName: 'Salary Expense', accountType: enums_1.GlAccountType.EXPENSE },
    { accountCode: exports.GL_ACCOUNT_CODES.UTILITY_EXPENSE, accountName: 'Utility Expense', accountType: enums_1.GlAccountType.EXPENSE },
    { accountCode: exports.GL_ACCOUNT_CODES.MAINTENANCE_EXPENSE, accountName: 'Maintenance Expense', accountType: enums_1.GlAccountType.EXPENSE },
];
