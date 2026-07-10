export interface HelpTopic {
  id: string;
  section: string;
  title: string;
  path: string;
  summary: string;
  steps: string[];
  keywords: string[];
}

export const ADMIN_HELP_TOPICS: HelpTopic[] = [
  {
    id: 'dashboard',
    section: 'Overview',
    title: 'Admin Dashboard',
    path: '/admin',
    summary: 'Operations overview with KPIs, attendance, finance, alerts, and quick actions.',
    steps: [
      'Open Dashboard from the sidebar or click Home in the top bar.',
      'Review Students, Staff, Collections, and Outstanding KPI cards.',
      'Check Attendance today and Finance snapshot, then use Needs attention or Quick actions (including LMS and Library).',
    ],
    keywords: ['dashboard', 'home', 'overview', 'kpi', 'summary', 'quick actions', 'alerts'],
  },
  {
    id: 'students',
    section: 'Students',
    title: 'Manage Students',
    path: '/admin/students',
    summary: 'Search, add, edit, and deactivate student records.',
    steps: [
      'Go to Students under All Students.',
      'Search by admission number, first name, or last name.',
      'Click a student to view details or use Add Student for new enrolments.',
    ],
    keywords: ['student', 'students', 'admission', 'learner', 'register'],
  },
  {
    id: 'enrollment',
    section: 'Students',
    title: 'Student Enrolment',
    path: '/admin/enrollment',
    summary: 'Register new students and assign class and form.',
    steps: [
      'Open Enrolment under All Students.',
      'Complete the student and guardian details.',
      'Assign class/form and save — a registration invoice is created automatically.',
    ],
    keywords: ['enrolment', 'enrollment', 'register', 'new student', 'admit'],
  },
  {
    id: 'class-list',
    section: 'Students',
    title: 'Class List',
    path: '/admin/class-list',
    summary: 'View students grouped by class.',
    steps: [
      'Open Class List.',
      'Select a class to see enrolled students.',
      'Export or print the list when needed.',
    ],
    keywords: ['class list', 'class', 'form', 'roster'],
  },
  {
    id: 'class-promotion',
    section: 'Students',
    title: 'Class Promotion',
    path: '/admin/class-promotion',
    summary: 'Promote students to the next class at end of year.',
    steps: [
      'Open Class Promotion.',
      'Review promotion rules per class.',
      'Run promotion for the selected class or whole school.',
    ],
    keywords: ['promotion', 'promote', 'advance', 'next class'],
  },
  {
    id: 'parents',
    section: 'Parents',
    title: 'Parent Records',
    path: '/admin/parents',
    summary: 'Manage parent/guardian accounts linked to students.',
    steps: [
      'Go to All Parents.',
      'Search by name or linked student.',
      'Open a parent record to view guardians and contact details.',
    ],
    keywords: ['parent', 'parents', 'guardian', 'family'],
  },
  {
    id: 'attendance-mark',
    section: 'Attendance',
    title: 'Mark Register',
    path: '/admin/attendance/mark-register',
    summary: 'Record daily student attendance by class.',
    steps: [
      'Open Mark Register under Attendance.',
      'Select class and date.',
      'Mark each student present, absent, or late, then save.',
    ],
    keywords: ['attendance', 'mark register', 'present', 'absent', 'register'],
  },
  {
    id: 'attendance-report',
    section: 'Attendance',
    title: 'Attendance Report',
    path: '/admin/attendance/report',
    summary: 'Review attendance statistics and exports.',
    steps: [
      'Open Attendance Report.',
      'Filter by class, term, or date range.',
      'Export or print the report.',
    ],
    keywords: ['attendance report', 'statistics', 'absence report'],
  },
  {
    id: 'staff',
    section: 'Staff',
    title: 'Staff Directory',
    path: '/admin/staff',
    summary: 'Manage teachers and non-teaching staff.',
    steps: [
      'Go to Staff Directory under All Teachers.',
      'Add or edit staff profiles and departments.',
      'Deactivate staff who have left the school.',
    ],
    keywords: ['staff', 'teacher', 'employees', 'directory'],
  },
  {
    id: 'payroll',
    section: 'Staff',
    title: 'Payroll',
    path: '/admin/payroll',
    summary: 'Run payroll and generate payslips.',
    steps: [
      'Open Payroll.',
      'Configure staff salary profiles if needed.',
      'Create a payroll run and review payslips before finalising.',
    ],
    keywords: ['payroll', 'salary', 'payslip', 'wages'],
  },
  {
    id: 'record-marks',
    section: 'Examinations',
    title: 'Input Marks',
    path: '/admin/exams',
    summary: 'Enter exam marks by class, subject, and term.',
    steps: [
      'Open Input Marks under Examinations.',
      'Select class, exam type, subject, and term.',
      'Enter marks for each student and save.',
    ],
    keywords: ['exam marks', 'input marks', 'record marks', 'marks', 'results', 'scores', 'exams'],
  },
  {
    id: 'report-cards',
    section: 'Examinations',
    title: 'Report Cards',
    path: '/admin/report-cards',
    summary: 'Generate and publish student report cards.',
    steps: [
      'Open Report Cards.',
      'Select class, term, and exam type.',
      'Preview report cards, add remarks, then publish or print.',
    ],
    keywords: ['report card', 'report cards', 'publish results'],
  },
  {
    id: 'mark-sheet',
    section: 'Examinations',
    title: 'Mark Sheet',
    path: '/admin/mark-sheet',
    summary: 'View consolidated mark sheets per class.',
    steps: [
      'Open Mark Sheet.',
      'Choose class, term, and exam type.',
      'Review or export the mark sheet.',
    ],
    keywords: ['mark sheet', 'marksheet', 'consolidated marks'],
  },
  {
    id: 'results-analysis',
    section: 'Examinations',
    title: 'Results Analysis',
    path: '/admin/results-analysis',
    summary: 'Analyse class and subject performance.',
    steps: [
      'Open Results Analysis.',
      'Select filters for class, term, and exam.',
      'Review charts and performance breakdowns.',
    ],
    keywords: ['results analysis', 'analysis', 'performance', 'statistics'],
  },
  {
    id: 'ranking',
    section: 'Examinations',
    title: 'Ranking',
    path: '/admin/ranking',
    summary: 'View student rankings by exam results.',
    steps: [
      'Open Ranking.',
      'Select class, term, and exam type.',
      'Review top performers and class positions.',
    ],
    keywords: ['ranking', 'rank', 'position', 'top students'],
  },
  {
    id: 'billing',
    section: 'Finance',
    title: 'Billing & Invoices',
    path: '/admin/billing',
    summary: 'Create invoices, bulk tuition billing, and view invoice list.',
    steps: [
      'Open Billing under Finance.',
      'Use Create Invoice for a single student or Bulk Tuition for the whole school.',
      'Review the Invoices tab and open PDF copies when needed.',
    ],
    keywords: ['billing', 'invoice', 'invoices', 'tuition', 'fees', 'bill'],
  },
  {
    id: 'payment',
    section: 'Finance',
    title: 'Record Payment',
    path: '/admin/payment',
    summary: 'Record fee payments against student invoices.',
    steps: [
      'Open Payment under Finance.',
      'Search for a student by ID or name.',
      'Select the invoice, enter amount and method, then save.',
    ],
    keywords: ['payment', 'pay', 'receipt', 'collect', 'cash'],
  },
  {
    id: 'manage-fees',
    section: 'Finance',
    title: 'Manage Fees',
    path: '/admin/manage-fees',
    summary: 'Configure fee types and default amounts.',
    steps: [
      'Open Manage Fees.',
      'Add or edit fee items (tuition, registration, desk fee, etc.).',
      'Set default amounts used when creating invoices.',
    ],
    keywords: ['manage fees', 'fee catalog', 'fee types', 'charges'],
  },
  {
    id: 'student-balance',
    section: 'Finance',
    title: 'Student Balance',
    path: '/admin/student-balance',
    summary: 'Look up a student\'s total invoiced, paid, and outstanding balance.',
    steps: [
      'Open Student Balance.',
      'Enter student ID, first name, or last name.',
      'Click Search to view balance details.',
    ],
    keywords: ['student balance', 'balance', 'owing', 'outstanding', 'debt'],
  },
  {
    id: 'finance-books',
    section: 'Finance',
    title: 'Financial Books',
    path: '/admin/finance',
    summary: 'Cashbook and ledger entries for school accounts.',
    steps: [
      'Open Financial Books.',
      'Review cashbook entries and account movements.',
      'Add manual entries when required.',
    ],
    keywords: ['financial books', 'cashbook', 'ledger', 'accounts'],
  },
  {
    id: 'student-ledger',
    section: 'Fin. Reports',
    title: 'Student Ledger',
    path: '/admin/fin-reports/student-ledger',
    summary: 'Term-by-term transaction history for a student.',
    steps: [
      'Open Student Ledger under Fin. Reports.',
      'Search for a student and select a term.',
      'Review invoices, payments, and running balance.',
    ],
    keywords: ['student ledger', 'ledger', 'transactions', 'history'],
  },
  {
    id: 'outstanding-invoices',
    section: 'Fin. Reports',
    title: 'Outstanding Invoices',
    path: '/admin/fin-reports/outstanding-invoices',
    summary: 'List all unpaid invoice balances by class.',
    steps: [
      'Open Outstanding Invoices.',
      'Use Get Balance to look up a specific student.',
      'Filter by class or due date, then record payment from a row.',
    ],
    keywords: ['outstanding', 'unpaid', 'debtors', 'owe', 'arrears'],
  },
  {
    id: 'student-reconciliation',
    section: 'Fin. Reports',
    title: 'Student Reconciliation',
    path: '/admin/fin-reports/student-reconciliation',
    summary: 'Reconcile student accounts against invoices and payments.',
    steps: [
      'Open Student Reconciliation.',
      'Run the report for a term or date range.',
      'Investigate mismatches and correct invoice or payment records.',
    ],
    keywords: ['reconciliation', 'reconcile', 'mismatch'],
  },
  {
    id: 'debtor-aging',
    section: 'Fin. Reports',
    title: 'Debtor Aging',
    path: '/admin/fin-reports/debtor-aging',
    summary: 'See how long invoices have been outstanding.',
    steps: [
      'Open Debtor Aging.',
      'Review buckets (current, 30, 60, 90+ days).',
      'Follow up with parents on overdue accounts.',
    ],
    keywords: ['debtor aging', 'aging', 'overdue', 'collections'],
  },
  {
    id: 'fee-collection',
    section: 'Fin. Reports',
    title: 'Fee Collection & Revenue',
    path: '/admin/fin-reports/fee-collection-revenue',
    summary: 'Track fee collection rates and revenue by period.',
    steps: [
      'Open Fee Collection & Revenue.',
      'Select the term or period to analyse.',
      'Review collection percentage and revenue totals.',
    ],
    keywords: ['fee collection', 'revenue', 'collection rate', 'income'],
  },
  {
    id: 'report-builder',
    section: 'Analytics & Reporting',
    title: 'Custom Report Builder',
    path: '/admin/analytics/report-builder',
    summary: 'Build custom reports from school datasets, then export or save as templates.',
    steps: [
      'Open Report Builder under Analytics & Reporting.',
      'Choose a dataset, select fields and filters, then click Run report.',
      'Export as CSV, Excel, or PDF, or save the configuration as a reusable template.',
    ],
    keywords: ['report builder', 'custom report', 'export', 'template', 'analytics', 'csv', 'excel', 'pdf'],
  },
  {
    id: 'lms',
    section: 'Learning',
    title: 'LMS Workspace',
    path: '/admin/lms',
    summary: 'Create graded assignments, lesson materials, and virtual classes.',
    steps: [
      'Open LMS under Learning.',
      'Select a class and subject, then create assignments, upload lessons, or schedule virtual classes.',
      'Open an assignment to review submissions and enter grades.',
    ],
    keywords: ['lms', 'learning', 'assignments', 'lessons', 'virtual class', 'hybrid', 'grade'],
  },
  {
    id: 'library',
    section: 'Learning',
    title: 'Digital Library',
    path: '/admin/library',
    summary: 'Publish and browse PDFs, books, videos, and links for classes.',
    steps: [
      'Open Digital Library under Learning.',
      'Use Add resource to upload a file or paste a link, then set subject/form if needed.',
      'Search or filter the catalog, open files, and bookmark items for quick access.',
    ],
    keywords: ['library', 'digital library', 'pdf', 'book', 'resource', 'bookmark', 'upload'],
  },
  {
    id: 'announcements',
    section: 'Communication',
    title: 'Send Announcements',
    path: '/admin/communication/send',
    summary: 'Send messages to parents, staff, or classes.',
    steps: [
      'Open Announcements under Communication.',
      'Compose your message and choose recipients.',
      'Send via SMS, email, or WhatsApp if configured.',
    ],
    keywords: ['announcement', 'send message', 'sms', 'email', 'whatsapp'],
  },
  {
    id: 'inbox',
    section: 'Communication',
    title: 'Messages Inbox',
    path: '/admin/communication/inbox',
    summary: 'Read incoming messages from parents and staff.',
    steps: [
      'Click Messages in the top bar or open Messages under Communication.',
      'Select a conversation to read and reply.',
    ],
    keywords: ['messages', 'inbox', 'communication', 'chat'],
  },
  {
    id: 'timetable-periods',
    section: 'Timetable',
    title: 'Configure Periods',
    path: '/admin/timetable/configure-periods',
    summary: 'Set up school periods and break times.',
    steps: [
      'Open Configure Periods under Timetable.',
      'Define period names, start times, and duration.',
      'Save before generating timetables.',
    ],
    keywords: ['timetable', 'periods', 'configure periods', 'schedule'],
  },
  {
    id: 'timetable-generate',
    section: 'Timetable',
    title: 'Generate Timetable',
    path: '/admin/timetable/generate',
    summary: 'Build class timetables from subjects and teachers.',
    steps: [
      'Open Generate Timetable.',
      'Select class and term.',
      'Assign subjects to periods and save.',
    ],
    keywords: ['generate timetable', 'build timetable', 'schedule'],
  },
  {
    id: 'timetable-view',
    section: 'Timetable',
    title: 'View Timetable',
    path: '/admin/timetable/view',
    summary: 'Print or review timetables by class or teacher.',
    steps: [
      'Open View Timetable.',
      'Filter by class or teacher.',
      'Print or export the timetable.',
    ],
    keywords: ['view timetable', 'print timetable'],
  },
  {
    id: 'school-settings',
    section: 'System Admin',
    title: 'School Settings',
    path: '/admin/settings',
    summary: 'School name, logo, contact details, and branding.',
    steps: [
      'Open School Settings under System Admin.',
      'Update school profile and branding.',
      'Save changes — they appear on invoices and report cards.',
    ],
    keywords: ['school settings', 'settings', 'logo', 'branding'],
  },
  {
    id: 'academic-settings',
    section: 'System Admin',
    title: 'Academic Settings',
    path: '/admin/academic-settings',
    summary: 'Manage school years, terms, classes, and subjects.',
    steps: [
      'Open Academic Settings.',
      'Set the current term and add school years/terms.',
      'Configure classes, forms, and subjects.',
    ],
    keywords: ['academic settings', 'terms', 'school year', 'subjects', 'classes'],
  },
  {
    id: 'user-management',
    section: 'System Admin',
    title: 'User Management',
    path: '/admin/user-management',
    summary: 'Create and manage user login accounts.',
    steps: [
      'Open User Management.',
      'Add users and assign roles (admin, teacher, parent).',
      'Reset passwords or deactivate accounts when needed.',
    ],
    keywords: ['user management', 'users', 'accounts', 'login', 'password'],
  },
  {
    id: 'user-permissions',
    section: 'System Admin',
    title: 'User Permissions',
    path: '/admin/user-permissions',
    summary: 'Configure role-based access permissions.',
    steps: [
      'Open User Permissions.',
      'Select a role or custom role.',
      'Enable or disable module permissions and save.',
    ],
    keywords: ['permissions', 'roles', 'access control', 'security'],
  },
  {
    id: 'integrations',
    section: 'System Admin',
    title: 'Integrations',
    path: '/admin/integrations',
    summary: 'Connect SMS, email, and WhatsApp services.',
    steps: [
      'Open Integrations.',
      'Enter API keys and sender details for each channel.',
      'Test connectivity before sending live messages.',
    ],
    keywords: ['integrations', 'sms', 'whatsapp', 'email', 'api'],
  },
];

export function helpTopicsForRole(role: string | undefined): HelpTopic[] {
  const r = (role || '').toLowerCase();
  if (r === 'admin') return ADMIN_HELP_TOPICS;
  return ADMIN_HELP_TOPICS;
}

export function scoreHelpTopic(topic: HelpTopic, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  let score = 0;
  const haystack = [
    topic.title,
    topic.summary,
    topic.section,
    ...topic.steps,
    ...topic.keywords,
  ]
    .join(' ')
    .toLowerCase();

  if (topic.title.toLowerCase().includes(q)) score += 20;
  if (topic.keywords.some((k) => k.includes(q) || q.includes(k))) score += 15;
  if (haystack.includes(q)) score += 8;

  for (const word of q.split(/\s+/).filter(Boolean)) {
    if (topic.title.toLowerCase().includes(word)) score += 6;
    if (topic.keywords.some((k) => k.includes(word))) score += 5;
    if (topic.section.toLowerCase().includes(word)) score += 3;
    if (haystack.includes(word)) score += 2;
  }

  return score;
}
