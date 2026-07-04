import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';
import { environment } from '../../../environments/environment';
import { HelpTopic, helpTopicsForRole, scoreHelpTopic } from '../../core/config/system-help-manual';
import { downloadHelpManualPdf } from '../../core/utils/help-manual-pdf.util';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  badge?: string | number;
  queryParams?: Record<string, string | number>;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
  path?: string;
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
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet, FormsModule],
  templateUrl: './portal-layout.component.html',
  styleUrl: './portal-layout.component.scss',
})
export class PortalLayoutComponent implements OnInit, OnDestroy {
  @Input() portalTitle = 'Portal';
  @Input() pageTitle = 'Dashboard';
  /** Target for the "Home" link in the top bar. Falls back to the first nav path. */
  @Input() homePath = '';
  /** Optional target for the "Messages" action in the top bar. Hidden when empty. */
  @Input() messagesPath = '';
  /** Flat list (legacy / teacher & parent portals). */
  @Input() navItems: NavItem[] = [];
  /** Grouped navigation with section headings (admin portal). */
  @Input() navSections: NavSection[] = [];
  auth = inject(AuthService);
  private api = inject(ApiService);
  private messageBadge = inject(MessageBadgeService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);
  private routerSub?: Subscription;
  readonly userMenuOpen = signal(false);
  readonly logoutConfirmOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly helpQuery = signal('');
  readonly helpNoMatch = signal(false);
  readonly helpPdfLoading = signal(false);
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
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(false);

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
    return ['admin', 'director', 'principal'].includes(role);
  }

  get homeLink(): string {
    if (this.homePath) return this.homePath;
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
    const order = ['Main', 'People', 'Learning', 'Finance', 'Administration'];
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
    this.initExpandedSections();
    if (this.auth.isLoggedIn()) {
      this.loadSchoolLinks();
      this.messageBadge.startPolling();
    }
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSidebar();
        this.ensureActiveSectionExpanded();
        this.messageBadge.refresh();
      });
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

  closeSidebar(): void {
    if (!this.sidebarOpen()) return;
    this.sidebarOpen.set(false);
    this.syncBodyScroll();
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
    if (this.userMenuOpen()) {
      this.closeSidebar();
      this.closeHelp();
      this.closeBalanceEnquiry();
    }
  }

  openBalanceEnquiry(): void {
    this.balanceOpen.set(true);
    this.balanceSearched.set(false);
    this.balanceResults.set([]);
    this.balanceSelected.set(null);
    this.userMenuOpen.set(false);
    this.closeSidebar();
    this.closeHelp();
  }

  closeBalanceEnquiry(): void {
    this.balanceOpen.set(false);
    this.balanceQuery = '';
    this.balanceSearched.set(false);
    this.balanceResults.set([]);
    this.balanceSelected.set(null);
  }

  getBalanceEnquiry(): void {
    const q = this.balanceQuery.trim();
    if (!q) return;

    this.balanceLoading.set(true);
    this.balanceSearched.set(true);
    this.balanceSelected.set(null);

    this.api.get<BalanceEnquiryRow[]>('/billing/student-balance', { q }).subscribe({
      next: (rows) => {
        this.balanceResults.set(rows);
        this.balanceLoading.set(false);
        if (rows.length === 1) {
          this.balanceSelected.set(rows[0]);
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
    void this.router.navigate(['/admin/fin-reports/record-payment', row.id]);
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
    this.helpOpen.set(true);
    this.helpNoMatch.set(false);
    this.userMenuOpen.set(false);
    this.closeSidebar();
    this.closeBalanceEnquiry();
  }

  closeHelp(): void {
    this.helpOpen.set(false);
    this.helpQuery.set('');
    this.helpNoMatch.set(false);
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
    this.logoutConfirmOpen.set(true);
  }

  cancelLogout(): void {
    this.logoutConfirmOpen.set(false);
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

  isExpanded(heading: string): boolean {
    return this.expandedSections().has(heading);
  }

  toggleSection(heading: string): void {
    this.expandedSections.update((set) => {
      if (set.has(heading)) {
        return new Set<string>();
      }
      return new Set([heading]);
    });
  }

  sectionHasActive(section: NavSection): boolean {
    if (section.path && this.isNavItemActive(section.path)) return true;
    return section.items.some((item) => this.isNavItemActive(item.path));
  }

  private initExpandedSections(): void {
    const active = this.navSections.find((s) => s.items.length && this.sectionHasActive(s));
    this.expandedSections.set(active ? new Set([active.heading]) : new Set());
  }

  /** Keep only the section for the current route expanded. */
  private ensureActiveSectionExpanded(): void {
    const active = this.navSections.find((s) => s.items.length && this.sectionHasActive(s));
    if (!active) return;
    this.expandedSections.set(new Set([active.heading]));
  }

  private isNavItemActive(path: string): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    if (path === '/admin') {
      return url === '/admin' || url === '/admin/';
    }
    return url === path || url.startsWith(`${path}/`);
  }

  sectionGroup(heading: string): string {
    const h = heading.toLowerCase();
    if (h === 'overview' || h === 'dashboard') return 'Main';
    if (h === 'students' || h === 'all students' || h === 'parents' || h === 'all parents' || h === 'staff' || h === 'all teachers' || h === 'attendance' || h === 'communication') return 'People';
    if (h === 'academics' || h === 'examination' || h === 'examinations' || h === 'timetable') return 'Learning';
    if (h === 'finance' || h === 'fin.reports') return 'Finance';
    return 'Administration';
  }

  sectionDomId(heading: string): string {
    return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  sectionIconKey(heading: string): string {
    const h = heading.toLowerCase();
    if (h === 'overview' || h === 'dashboard') return 'dashboard';
    if (h === 'students' || h === 'all students') return 'students';
    if (h === 'parents' || h === 'all parents') return 'parents';
    if (h === 'payroll') return 'staff';
    if (h === 'attendance') return 'attendance';
    if (h === 'staff' || h === 'all teachers') return 'staff';
    if (h === 'academics' || h === 'examination' || h === 'examinations') return 'examinations';
    if (h === 'finance') return 'finance';
    if (h === 'fin.reports' || h === 'fin. reports') return 'fin-reports';
    if (h === 'communication') return 'communication';
    if (h === 'timetable') return 'timetable';
    if (h === 'system admin') return 'system-admin';
    return 'default';
  }

  private loadSchoolLinks(): void {
    this.api.get<{
      schoolName: string | null;
      logoUrl: string | null;
      website: string | null;
      facebookPageUrl: string | null;
    }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.schoolName) this.schoolName.set(data.schoolName);
        this.schoolLogoUrl.set(this.toAssetUrl(data.logoUrl));
        this.schoolWebsiteUrl.set(this.toExternalUrl(data.website));
        this.schoolFacebookUrl.set(this.toExternalUrl(data.facebookPageUrl));
      },
      error: () => {
        this.schoolLogoUrl.set(null);
        this.schoolWebsiteUrl.set(null);
        this.schoolFacebookUrl.set(null);
      },
    });
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
