import { NavSection } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Sidebar navigation for the Accountant Portal. */
export const ACCOUNTANT_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Dashboard',
    items: [],
    path: '/accountant',
  },
  {
    heading: 'Students',
    items: [
      { label: 'Register Students', path: '/accountant/students', icon: '👥', permission: 'students.manage' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Billing', path: '/accountant/billing', icon: '🧾', permission: 'finance.billing' },
      { label: 'Payment', path: '/accountant/payment', icon: '💳', permission: 'finance.billing' },
      { label: 'Manage Fees', path: '/accountant/manage-fees', icon: '💵', permission: 'finance.fees' },
      { label: 'Student Balance', path: '/accountant/student-balance', icon: '🧮', permission: 'finance.student_balance' },
      { label: 'Exemption', path: '/accountant/exemptions', icon: '🎫', permission: 'finance.fees' },
      { label: 'Financial Books', path: '/accountant/finance', icon: '📚', permission: 'finance.books' },
    ],
  },
  {
    heading: 'Fin. Reports',
    items: [
      { label: 'Student Ledger', path: '/accountant/fin-reports/student-ledger', icon: '📒', permission: 'finance.reports' },
      { label: 'Outstanding Invoices', path: '/accountant/fin-reports/outstanding-invoices', icon: '🧾', permission: 'finance.reports' },
      { label: 'Student Reconciliation', path: '/accountant/fin-reports/student-reconciliation', icon: '⚖', permission: 'finance.reports' },
      { label: 'Debtor Aging', path: '/accountant/fin-reports/debtor-aging', icon: '⏳', permission: 'finance.reports' },
      { label: 'Fee Collection & Revenue', path: '/accountant/fin-reports/fee-collection-revenue', icon: '📉', permission: 'finance.reports' },
      { label: 'General Ledger', path: '/accountant/fin-reports/general-ledger', icon: '📗', permission: 'finance.reports' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.accountant, icon: CHANGE_PASSWORD_ICON },
    ],
  },
];
