import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  badge?: string | number;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
  path?: string;
}

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './portal-layout.component.html',
  styleUrl: './portal-layout.component.scss',
})
export class PortalLayoutComponent implements OnInit, OnDestroy {
  @Input() portalTitle = 'Portal';
  @Input() pageTitle = 'Dashboard';
  /** Flat list (legacy / teacher & parent portals). */
  @Input() navItems: NavItem[] = [];
  /** Grouped navigation with section headings (admin portal). */
  @Input() navSections: NavSection[] = [];
  auth = inject(AuthService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);
  private routerSub?: Subscription;
  readonly userMenuOpen = signal(false);
  readonly logoutConfirmOpen = signal(false);
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(false);

  /** Section headings that are expanded in the sidebar. */
  readonly expandedSections = signal<Set<string>>(new Set());

  get useSections(): boolean {
    return this.navSections.length > 0;
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
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSidebar();
        this.ensureActiveSectionExpanded();
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    document.body.style.overflow = '';
  }

  get fullName(): string {
    const u = this.auth.user();
    return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User';
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
    }
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
}
