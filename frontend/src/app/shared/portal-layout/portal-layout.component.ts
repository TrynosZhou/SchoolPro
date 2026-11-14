import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';
import { ThemeService, FontScale, ThemeMode } from '../../core/services/theme.service';
import { I18nService, AppLocale } from '../../core/services/i18n.service';
import { OfflineService } from '../../core/services/offline.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { environment } from '../../../environments/environment';
import { HelpTopic, helpTopicsForRole, scoreHelpTopic } from '../../core/config/system-help-manual';
import { downloadHelpManualPdf } from '../../core/utils/help-manual-pdf.util';
import {
  changePasswordPathForRole,
  changePasswordQueryParamsForRole,
} from '../../core/utils/change-password-route.util';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  badge?: string | number;
  queryParams?: Record<string, string | number>;
  /** When set, the item is shown only if the user has at least one of these permissions. */
  permission?: string | string[];
}

export interface NavSection {
  heading: string;
  items: NavItem[];
  path?: string;
}

const PORTAL_PREFIXES = ['/admin', '/teacher', '/director', '/principal', '/accountant', '/parent', '/student'];

/**
 * Defence in depth: a signed-in teacher only ever sees /teacher menus and an admin only /admin menus.
 * Entries pointing into another role's portal are dropped (routes are separately protected by roleGuard).
 */
function confineNavToRole(sections: NavSection[], role: string): NavSection[] {
  if (role !== 'admin' && role !== 'teacher') return sections;
  const own = `/${role}`;
  const foreign = (path?: string) =>
    !!path &&
    PORTAL_PREFIXES.some((p) => p !== own && (path === p || path.startsWith(p + '/'))) ;
  return sections
    .filter((section) => !foreign(section.path))
    .map((section) => ({ ...section, items: section.items.filter((item) => !foreign(item.path)) }))
    .filter((section) => section.path || section.items.length > 0);
}

interface BalanceEnquiryRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  classLabel?: string;
  balance: number;
}

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet, FormsModule, TranslatePipe],
  templateUrl: './portal-layout.component.html',
  styleUrl: './portal-layout.component.scss',
})
export class PortalLayoutComponent implements OnInit, OnChanges, OnDestroy {
  @Input() portalTitle = 'Portal';
  @Input() pageTitle = 'Dashboard';
  /** Target for the "Home" link in the top bar. Falls back to the first nav path. */
  @Input() homePath = '';
  /** Optional target for the "Messages" action in the top bar. Hidden when empty. */
  @Input() messagesPath = '';
  /** Flat list (legacy / teacher & parent portals). */
  @Input() navItems: NavItem[] = [];
  /** Grouped navigation with section headings (admin portal). */
  @Input()
  set navSections(value: NavSection[]) {
    this._navSectionsSource = value ?? [];
  }
  get navSections(): NavSection[] {
    const role = (this.auth?.user()?.role || '').toLowerCase();
    if (this._navConfinedSource !== this._navSectionsSource || this._navConfinedRole !== role) {
      this._navConfinedSource = this._navSectionsSource;
      this._navConfinedRole = role;
      this._navConfined = confineNavToRole(this._navSectionsSource, role);
    }
    return this._navConfined;
  }
  private _navSectionsSource: NavSection[] = [];
  private _navConfined: NavSection[] = [];
  private _navConfinedSource: NavSection[] | null = null;
  private _navConfinedRole = '';
  auth = inject(AuthService);
  private api = inject(ApiService);
  private messageBadge = inject(MessageBadgeService);
  readonly theme = inject(ThemeService);
  readonly i18n = inject(I18nService);
  readonly offline = inject(OfflineService);
  private router = inject(Router);
  private title = inject(Title);
  private elementRef = inject(ElementRef<HTMLElement>);
  private routerSub?: Subscription;
  readonly userMenuOpen = signal(false);
  readonly logoutConfirmOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly helpTab = signal<'manual' | 'developer'>('manual');
  readonly helpQuery = signal('');
  readonly helpNoMatch = signal(false);
  readonly helpPdfLoading = signal(false);

  readonly systemDeveloper = {
    name: 'Trynos Zhou',
    qualifications: [
      'BSc Hons Information Systems (MSU)',
      'PGDE — Post Graduate Diploma in Education (MSU)',
    ],
    contacts: [
      {
        label: 'WhatsApp number',
        display: '+263 777751301',
        telHref: 'tel:+263777751301',
        whatsappHref:
          'https://wa.me/263777751301?text=' +
          encodeURIComponent('Hello Trynos Zhou, I am contacting you regarding School Pro.'),
      },
      {
        label: 'WhatsApp number',
        display: '+263 783128556',
        telHref: 'tel:+263783128556',
        whatsappHref:
          'https://wa.me/263783128556?text=' +
          encodeURIComponent('Hello Trynos Zhou, I am contacting you regarding School Pro.'),
      },
    ],
  } as const;

  readonly developerPhotoUrl = signal<string | null>(null);
  readonly developerPhotoUploading = signal(false);
  readonly developerPhotoToast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  readonly canManageDeveloperPhoto = computed(
    () => (this.auth.user()?.role || '').toLowerCase() === 'admin',
  );
  readonly balanceOpen = signal(false);
  balanceQuery = '';
  readonly balanceLoading = signal(false);
  readonly balanceSearched = signal(false);
  readonly balanceResults = signal<BalanceEnquiryRow[]>([]);
  readonly balanceSelected = signal<BalanceEnquiryRow | null>(null);
  readonly schoolName = signal('School Pro');
  readonly schoolLogoUrl = signal<string | null>(null);
  readonly schoolWebsiteUrl = signal<string | null>(null);
  readonly schoolFacebookUrl = signal<string | null>(null);
  readonly currency = signal('USD');
  readonly currencySymbol = computed(() => {
    const c = this.currency();
    if (c === 'INR') return '₹';
    if (c === 'GBP') return '£';
    if (c === 'EUR') return '€';
    return '$';
  });
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  private lastFocusEl: HTMLElement | null = null;

  readonly unreadMessageCount = this.messageBadge.unreadCount;

  readonly helpTopics = computed(() => helpTopicsForRole(this.auth.user()?.role));

  readonly filteredHelpTopics = computed(() => {
    const q = this.helpQuery().trim();
    const topics = this.helpTopics();
    if (!q) return topics;

    return [...topics]
      .map((topic) => ({ topic, score: scoreHelpTopic(topic, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title))
      .map((row) => row.topic);
  });

  readonly helpSections = computed(() => {
    const topics = this.filteredHelpTopics();
    const map = new Map<string, HelpTopic[]>();
    for (const topic of topics) {
      if (!map.has(topic.section)) map.set(topic.section, []);
      map.get(topic.section)!.push(topic);
    }
    return [...map.entries()].map(([section, items]) => ({ section, items }));
  });

  /** Section headings that are expanded in the sidebar. */
  readonly expandedSections = signal<Set<string>>(new Set());

  get useSections(): boolean {
    return this.navSections.length > 0;
  }

  get showBalanceEnquiry(): boolean {
    const role = (this.auth.user()?.role || '').toLowerCase();
    return ['admin', 'director', 'principal', 'accountant'].includes(role);
  }

  get homeLink(): string {
    if (this.homePath) return this.homePath;
    const title = this.portalTitle;
    if (title === 'Parent Portal') return '/parent';
    if (title === 'Student Portal') return '/student';
    if (title === 'Teacher Portal') return '/teacher';
    if (title === 'Admin Portal') return '/admin';
    if (this.navSections.length) {
      return this.navSections[0].path || this.navSections[0].items[0]?.path || '/';
    }
    if (this.navItems.length) return this.navItems[0].path;
    return '/';
  }

  get effectiveMessagesPath(): string {
    if (this.messagesPath) return this.messagesPath;
    const role = (this.auth.user()?.role || '').toLowerCase();
    return this.messageBadge.messagesPathForRole(role);
  }

  get showMessagesAction(): boolean {
    return Boolean(this.effectiveMessagesPath) && this.messageBadge.roleHasInbox((this.auth.user()?.role || '').toLowerCase());
  }

  unreadBadgeLabel(count: number): string {
    if (count > 99) return '99+';
    return String(count);
  }

  get groupedNav(): { label: string; sections: NavSection[] }[] {
    // Student portal: keep sections in catalog order (Dashboard → Academics → Finance → Communication → Account).
    if (this.portalTitle === 'Student Portal') {
      return [{ label: 'Main', sections: this.navSections }];
    }

    const order = ['MAIN', 'ACADEMICS', 'ADMINISTRATION', 'SYSTEM'];
    const map = new Map<string, NavSection[]>();
    for (const section of this.navSections) {
      const group = this.sectionGroup(section.heading);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(section);
    }
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, sections: map.get(label)! }));
  }

  ngOnInit(): void {
    this.updateDocumentTitle();
    this.initExpandedSections();
    if (this.auth.isLoggedIn()) {
      this.loadSchoolLinks();
      this.messageBadge.startPolling();
    }
    if (this.offline.online()) {
      void this.offline.flushQueue();
    }
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSidebar();
        this.ensureActiveSectionExpanded();
        this.messageBadge.refresh();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageTitle'] || changes['portalTitle']) {
      this.updateDocumentTitle();
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.messageBadge.stopPolling();
    document.body.style.overflow = '';
  }

  get fullName(): string {
    const u = this.auth.user();
    return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User';
  }

  get accountEmail(): string {
    return this.auth.user()?.email?.trim() || '—';
  }

  get changePasswordPath(): string | null {
    return changePasswordPathForRole(this.auth.user()?.role);
  }

  get changePasswordQueryParams(): Record<string, string> | null {
    return changePasswordQueryParamsForRole(this.auth.user()?.role);
  }

  get avatarUrl(): string | null {
    const u = this.auth.user() as { avatarUrl?: string | null } | null;
    const url = u?.avatarUrl?.trim();
    return url || null;
  }

  get userRoleLabel(): string {
    const role = (this.auth.user()?.role || 'user').toString().toLowerCase();
    return role
      .split('_')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  get userInitials(): string {
    const u = this.auth.user();
    const first = (u?.firstName || '').trim();
    const last = (u?.lastName || '').trim();
    const a = first ? first.charAt(0).toUpperCase() : '';
    const b = last ? last.charAt(0).toUpperCase() : '';
    return `${a}${b}` || 'SP';
  }

  get notificationsPath(): string {
    const role = (this.auth.user()?.role || '').toLowerCase();
    if (role === 'admin') return '/admin/communication/notifications';
    if (role === 'accountant') return '/accountant';
    if (role === 'teacher') return '/teacher/notifications';
    if (role === 'student') return '/student/notifications';
    if (role === 'parent') return '/parent/notifications';
    return '/';
  }

  /** "Follow us" links for the top header (configured in environment.social). */
  get socialLinks(): { facebook: string; instagram: string; website: string } {
    const social = (environment as { social?: Partial<Record<'facebook' | 'instagram' | 'website', string>> }).social ?? {};
    return {
      facebook: (social.facebook ?? '').trim(),
      instagram: (social.instagram ?? '').trim(),
      website: (social.website ?? '').trim(),
    };
  }

  get hasSocialLinks(): boolean {
    const l = this.socialLinks;
    return !!(l.facebook || l.instagram || l.website);
  }

  get calendarPath(): string {
    const role = (this.auth.user()?.role || '').toLowerCase();
    if (role === 'admin') return '/admin/timetable/view';
    if (role === 'teacher') return '/teacher/timetable';
    if (role === 'student') return '/student/lms';
    // Parents: opens the class timetable(s) of their linked children.
    if (role === 'parent') return '/parent/timetable';
    return '/';
  }

  get settingsPath(): string {
    const role = (this.auth.user()?.role || '').toLowerCase();
    if (role === 'admin') return '/admin/settings';
    return '/';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  get schoolBrandInitials(): string {
    const name = this.schoolName().trim();
    if (!name) return 'SP';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    this.syncBodyScroll();
    if (this.sidebarOpen()) {
      this.userMenuOpen.set(false);
    }
  }

  toggleSidebarCollapsed(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  cycleTheme(): void {
    this.theme.cycleTheme();
  }

  setTheme(mode: ThemeMode): void {
    this.theme.setTheme(mode);
  }

  setFontScale(scale: FontScale): void {
    this.theme.setFontScale(scale);
  }

  setLocale(code: AppLocale): void {
    void this.i18n.setLocale(code);
  }

  syncNow(): void {
    void this.offline.flushQueue();
  }

  navLabel(label: string): string {
    return this.i18n.nav(label);
  }

  closeSidebar(): void {
    if (!this.sidebarOpen()) return;
    this.sidebarOpen.set(false);
    this.syncBodyScroll();
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
    if (this.userMenuOpen()) {
      this.closeSidebar();
      this.closeHelpWithoutRestore();
      this.closeBalanceEnquiryWithoutRestore();
    }
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  openBalanceEnquiry(): void {
    this.captureFocus();
    this.balanceOpen.set(true);
    this.balanceSearched.set(false);
    this.balanceResults.set([]);
    this.balanceSelected.set(null);
    this.userMenuOpen.set(false);
    this.closeSidebar();
    this.closeHelpWithoutRestore();
    queueMicrotask(() => this.focusInDialog('.balance-modal'));
  }

  closeBalanceEnquiry(): void {
    this.balanceOpen.set(false);
    this.balanceQuery = '';
    this.balanceSearched.set(false);
    this.balanceResults.set([]);
    this.balanceSelected.set(null);
    this.restoreFocus();
  }

  getBalanceEnquiry(): void {
    const q = this.balanceQuery.trim();
    if (!q) return;

    this.balanceLoading.set(true);
    this.balanceSearched.set(true);
    this.balanceSelected.set(null);

    this.api.get<BalanceEnquiryRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        const id = q.toLowerCase();
        const matches = rows.filter((r) => (r.admissionNumber || '').trim().toLowerCase() === id);
        this.balanceResults.set(matches);
        this.balanceLoading.set(false);
        if (matches.length >= 1) {
          this.balanceSelected.set(matches[0]);
        }
      },
      error: () => {
        this.balanceResults.set([]);
        this.balanceLoading.set(false);
      },
    });
  }

  selectBalanceResult(row: BalanceEnquiryRow): void {
    this.balanceSelected.set(row);
  }

  goToRecordPayment(row: BalanceEnquiryRow): void {
    this.closeBalanceEnquiry();
    const role = (this.auth.user()?.role || '').toLowerCase();
    const base = role === 'accountant' ? '/accountant' : '/admin';
    void this.router.navigate([`${base}/fin-reports/record-payment`, row.id]);
  }

  formatGender(value?: string): string {
    if (!value) return '—';
    const v = value.trim().toLowerCase();
    if (v === 'm' || v === 'male') return 'Male';
    if (v === 'f' || v === 'female') return 'Female';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  formatClassName(value?: string): string {
    const cls = (value || '').trim();
    if (!cls) return '—';
    return /^class\s+/i.test(cls) ? cls : `Class ${cls}`;
  }

  formatMoney(value: number): string {
    return Number(value || 0).toFixed(2);
  }

  openHelp(): void {
    this.captureFocus();
    this.helpOpen.set(true);
    this.helpTab.set('manual');
    this.helpNoMatch.set(false);
    this.userMenuOpen.set(false);
    this.closeSidebar();
    this.closeBalanceEnquiryWithoutRestore();
    queueMicrotask(() => this.focusInDialog('.help-modal'));
  }

  setHelpTab(tab: 'manual' | 'developer'): void {
    this.helpTab.set(tab);
    if (tab === 'developer') {
      this.helpNoMatch.set(false);
      this.loadDeveloperPhoto();
    }
  }

  closeHelp(): void {
    this.helpOpen.set(false);
    this.helpTab.set('manual');
    this.helpQuery.set('');
    this.helpNoMatch.set(false);
    this.restoreFocus();
  }

  private closeHelpWithoutRestore(): void {
    this.helpOpen.set(false);
    this.helpTab.set('manual');
    this.helpQuery.set('');
    this.helpNoMatch.set(false);
  }

  /** Close balance without stealing focus when opening another overlay. */
  private closeBalanceEnquiryWithoutRestore(): void {
    this.balanceOpen.set(false);
    this.balanceQuery = '';
    this.balanceSearched.set(false);
    this.balanceResults.set([]);
    this.balanceSelected.set(null);
  }

  onHelpQueryChange(value: string): void {
    this.helpQuery.set(value);
    this.helpNoMatch.set(false);
  }

  submitHelpSearch(): void {
    const q = this.helpQuery().trim();
    if (!q) return;

    const matches = this.filteredHelpTopics();
    if (matches.length) {
      this.goToHelpTopic(matches[0]);
      return;
    }

    this.helpNoMatch.set(true);
  }

  goToHelpTopic(topic: HelpTopic): void {
    this.closeHelp();
    void this.router.navigateByUrl(topic.path);
  }

  downloadHelpManual(): void {
    if (this.helpPdfLoading()) return;
    this.helpPdfLoading.set(true);
    void downloadHelpManualPdf(this.helpTopics(), this.portalTitle)
      .catch(() => undefined)
      .finally(() => this.helpPdfLoading.set(false));
  }

  requestLogout(): void {
    this.captureFocus();
    this.logoutConfirmOpen.set(true);
    queueMicrotask(() => this.focusInDialog('.logout-modal'));
  }

  cancelLogout(): void {
    this.logoutConfirmOpen.set(false);
    this.restoreFocus();
  }

  confirmLogout(): void {
    this.logoutConfirmOpen.set(false);
    this.userMenuOpen.set(false);
    this.auth.logout();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.messageBadge.refresh();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.userMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.balanceOpen()) {
      this.closeBalanceEnquiry();
      return;
    }
    if (this.helpOpen()) {
      this.closeHelp();
      return;
    }
    if (this.sidebarOpen()) {
      this.closeSidebar();
      return;
    }
    if (this.userMenuOpen()) {
      this.userMenuOpen.set(false);
      return;
    }
    if (this.logoutConfirmOpen()) {
      this.cancelLogout();
    }
  }

  private syncBodyScroll(): void {
    document.body.style.overflow = this.sidebarOpen() ? 'hidden' : '';
  }

  private captureFocus(): void {
    this.lastFocusEl = document.activeElement as HTMLElement | null;
  }

  private restoreFocus(): void {
    const el = this.lastFocusEl;
    this.lastFocusEl = null;
    queueMicrotask(() => el?.focus?.());
  }

  private focusInDialog(selector: string): void {
    const root = this.elementRef.nativeElement.querySelector(selector) as HTMLElement | null;
    if (!root) return;
    const target =
      (root.querySelector(
        'input, button, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
      ) as HTMLElement | null) ?? root;
    target.focus?.();
  }

  isExpanded(heading: string): boolean {
    return this.expandedSections().has(heading);
  }

  toggleSection(heading: string): void {
    this.expandedSections.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(heading)) {
        newSet.delete(heading);
      } else {
        newSet.add(heading);
      }
      return newSet;
    });
  }

  sectionHasActive(section: NavSection): boolean {
    if (section.path && this.isNavItemActive(section.path)) return true;
    return section.items.some((item) => this.isNavItemActive(item.path));
  }

  private initExpandedSections(): void {
    // Expand only the major menu that contains the current route.
    const active = this.navSections.find((section) => this.sectionHasActive(section));
    this.expandedSections.set(new Set(active ? [active.heading] : []));
  }

  /** Expand the major menu that contains the current route. */
  private ensureActiveSectionExpanded(): void {
    const active = this.navSections.find((section) => this.sectionHasActive(section));
    if (!active || this.expandedSections().has(active.heading)) return;
    this.expandedSections.update((set) => new Set(set).add(active.heading));
  }

  private isNavItemActive(path: string): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    if (path === '/admin') {
      return url === '/admin' || url === '/admin/';
    }
    if (path === '/teacher') {
      return url === '/teacher' || url === '/teacher/';
    }
    if (path === '/student') {
      return url === '/student' || url === '/student/';
    }
    if (path === '/parent') {
      return url === '/parent' || url === '/parent/';
    }
    return url === path || url.startsWith(`${path}/`);
  }

  sectionGroup(heading: string): string {
    const h = heading.toLowerCase();
    // Teacher portal: Account sits under ADMINISTRATION, right after Communication.
    if (h === 'account' && this.portalTitle === 'Teacher Portal') return 'ADMINISTRATION';
    if (['dashboard', 'students', 'parents', 'staff', 'teachers', 'account'].includes(h)) return 'MAIN';
    if (['classes & subjects', 'classes', 'subjects', 'attendance', 'examinations', 'timetable', 'learning', 'academics'].includes(h)) {
      return 'ACADEMICS';
    }
    if (['finance', 'fin. reports', 'communication', 'administration'].includes(h)) return 'ADMINISTRATION';
    if (['analytics & reporting', 'system admin', 'system'].includes(h)) return 'SYSTEM';
    return 'MAIN';
  }

  sectionDomId(heading: string): string {
    return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private static readonly NAV_ICON_MAP: Record<string, string> = {
    dashboard: 'dashboard',
    students: 'students',
    admissions: 'students',
    enrolment: 'students',
    'class list': 'classes',
    'class promotion': 'classes',
    classes: 'classes',
    parents: 'parents',
    staff: 'staff',
    teachers: 'staff',
    subjects: 'subjects',
    attendance: 'attendance',
    'attendance report': 'attendance',
    academics: 'classes',
    timetable: 'timetable',
    'exams & results': 'examinations',
    'report cards': 'examinations',
    'mark sheet': 'examinations',
    'results analysis': 'examinations',
    ranking: 'examinations',
    'mark entry progress': 'examinations',
    'class assignments': 'classes',
    billing: 'finance',
    payment: 'finance',
    'manage fees': 'finance',
    'student balance': 'finance',
    exemptions: 'finance',
    'financial books': 'finance',
    fees: 'finance',
    administration: 'finance',
    'student ledger': 'fin-reports',
    'outstanding invoices': 'fin-reports',
    reconciliation: 'fin-reports',
    'student reconciliation': 'fin-reports',
    'debtor aging': 'fin-reports',
    'fee collection': 'fin-reports',
    'general ledger': 'fin-reports',
    reports: 'fin-reports',
    analytics: 'fin-reports',
    'report builder': 'fin-reports',
    payroll: 'staff',
    'leave requests': 'staff',
    'staff attendance': 'staff',
    announcements: 'communication',
    messages: 'communication',
    'bulk sms / email': 'communication',
    events: 'communication',
    notices: 'communication',
    'notification settings': 'system-admin',
    system: 'system-admin',
    'school settings': 'system-admin',
    'user management': 'system-admin',
    'user permissions': 'system-admin',
    integrations: 'system-admin',
    'audit trail': 'system-admin',
    // Major menu headings
    'classes & subjects': 'classes',
    examinations: 'examinations',
    learning: 'subjects',
    'fin. reports': 'fin-reports',
    'analytics & reporting': 'fin-reports',
    'system admin': 'system-admin',
    account: 'system-admin',
    'student dashboard': 'dashboard',
    'teacher dashboard': 'dashboard',
  };

  sectionIconKey(heading: string): string {
    return PortalLayoutComponent.NAV_ICON_MAP[heading.toLowerCase()] ?? 'default';
  }

  private updateDocumentTitle(): void {
    const label = [this.pageTitle, this.portalTitle].filter(Boolean).join(' · ');
    this.title.setTitle(label ? `${label} | School Pro` : 'School Pro');
  }

  private loadSchoolLinks(): void {
    this.api.get<{
      schoolName: string | null;
      logoUrl: string | null;
      website: string | null;
      facebookPageUrl: string | null;
      developerPhotoUrl?: string | null;
      currency?: string;
    }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.schoolName) this.schoolName.set(data.schoolName);
        this.schoolLogoUrl.set(this.toAssetUrl(data.logoUrl));
        this.schoolWebsiteUrl.set(this.toExternalUrl(data.website));
        this.schoolFacebookUrl.set(this.toExternalUrl(data.facebookPageUrl));
        this.developerPhotoUrl.set(this.toAssetUrl(data.developerPhotoUrl));
        if (data.currency) this.currency.set(data.currency);
      },
      error: () => {
        this.schoolLogoUrl.set(null);
        this.schoolWebsiteUrl.set(null);
        this.schoolFacebookUrl.set(null);
        this.developerPhotoUrl.set(null);
      },
    });
  }

  private loadDeveloperPhoto(): void {
    this.api.get<{ developerPhotoUrl?: string | null }>('/dashboard/school-links').subscribe({
      next: (data) => this.developerPhotoUrl.set(this.toAssetUrl(data.developerPhotoUrl)),
      error: () => undefined,
    });
  }

  onDeveloperPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      this.showDeveloperPhotoToast('error', 'Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.showDeveloperPhotoToast('error', 'Photo must be 2 MB or smaller.');
      return;
    }
    this.developerPhotoUploading.set(true);
    this.api.uploadFile<{ developerPhotoUrl?: string }>('/admin/settings/developer-photo', file, 'photo').subscribe({
      next: (saved) => {
        this.developerPhotoUploading.set(false);
        this.developerPhotoUrl.set(this.toAssetUrl(saved.developerPhotoUrl));
        this.showDeveloperPhotoToast('success', 'Passport photo uploaded.');
      },
      error: (e) => {
        this.developerPhotoUploading.set(false);
        this.showDeveloperPhotoToast('error', e.error?.message || 'Upload failed.');
      },
    });
  }

  removeDeveloperPhoto(): void {
    if (!confirm('Remove the system developer passport photo?')) return;
    this.developerPhotoUploading.set(true);
    this.api.delete<{ developerPhotoUrl?: string | null }>('/admin/settings/developer-photo').subscribe({
      next: () => {
        this.developerPhotoUploading.set(false);
        this.developerPhotoUrl.set(null);
        this.showDeveloperPhotoToast('success', 'Passport photo removed.');
      },
      error: (e) => {
        this.developerPhotoUploading.set(false);
        this.showDeveloperPhotoToast('error', e.error?.message || 'Could not remove photo.');
      },
    });
  }

  private showDeveloperPhotoToast(type: 'success' | 'error', msg: string): void {
    this.developerPhotoToast.set({ type, msg });
    setTimeout(() => this.developerPhotoToast.set(null), 3500);
  }

  private toAssetUrl(path: string | null | undefined): string | null {
    const value = path?.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
  }

  private toExternalUrl(raw: string | null | undefined): string | null {
    const value = raw?.trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
  }
}
