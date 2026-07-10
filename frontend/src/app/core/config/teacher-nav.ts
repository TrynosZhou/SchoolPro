import { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';
import { CHANGE_PASSWORD_ICON, CHANGE_PASSWORD_LABEL, CHANGE_PASSWORD_PATHS } from '../utils/change-password-route.util';

/** Full teacher sidebar catalog — filtered at runtime by user permissions. */
export const TEACHER_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Teacher Dashboard',
    items: [],
    path: '/teacher',
  },
  {
    heading: 'Students',
    items: [
      { label: 'Class List', path: '/teacher/class-list', icon: '📋', permission: 'students.view' },
      { label: 'Class Enrollment', path: '/teacher/enrollment', icon: '🎓', permission: 'enrollment.manage' },
    ],
  },
  {
    heading: 'Attendance',
    items: [
      { label: 'Mark Register', path: '/teacher/attendance/mark-register', icon: '✅', permission: 'attendance.mark' },
      { label: 'Attendance Report', path: '/teacher/attendance/report', icon: '📊', permission: 'attendance.report' },
    ],
  },
  {
    heading: 'Examinations',
    items: [
      { label: 'Input Marks', path: '/teacher/exams', icon: '📝', permission: 'academics.exams' },
      { label: 'Report Cards', path: '/teacher/report-cards', icon: '📄', permission: 'academics.report_cards' },
      { label: 'Mark Sheet', path: '/teacher/mark-sheet', icon: '📑', permission: 'academics.mark_sheet' },
      { label: 'Results Analysis', path: '/teacher/results-analysis', icon: '📈', permission: 'academics.results' },
      { label: 'Ranking', path: '/teacher/ranking', icon: '🏆', permission: 'academics.ranking' },
      { label: 'Mark Entry Progress', path: '/teacher/mark-entry-progress', icon: '📊', permission: 'academics.exams' },
    ],
  },
  {
    heading: 'Academics',
    items: [
      { label: 'Record Book', path: '/teacher/record-book', icon: '📒', permission: 'academics.exams' },
      { label: 'Assignments', path: '/teacher/assignments', icon: '📤', permission: 'academics.exams' },
      { label: 'LMS', path: '/teacher/lms', icon: '💻', permission: 'academics.exams' },
      { label: 'Library', path: '/teacher/library', icon: '📚', permission: 'academics.exams' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Messages', path: '/teacher/messages', icon: '💬', permission: ['communication.inbox', 'communication.send'] },
      { label: 'Notifications', path: '/teacher/notifications', icon: '🔔' },
    ],
  },
  {
    heading: 'Account',
    items: [{ label: CHANGE_PASSWORD_LABEL, path: CHANGE_PASSWORD_PATHS.teacher, icon: CHANGE_PASSWORD_ICON }],
  },
];

function itemAllowed(granted: Set<string>, item: NavItem): boolean {
  const key = item.permission;
  if (!key) return true;
  if (Array.isArray(key)) return key.some((k) => granted.has(k));
  return granted.has(key);
}

/** Build teacher sidebar sections visible for the signed-in user's permissions. */
export function buildTeacherNavSections(
  userPermissions: string[] | undefined,
  options?: { classTeacher?: boolean },
): NavSection[] {
  const granted = new Set(userPermissions ?? []);
  return TEACHER_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.path === '/teacher/enrollment' && options?.classTeacher === false) return false;
      return itemAllowed(granted, item);
    }),
  })).filter((section) => section.path || section.items.length > 0);
}
