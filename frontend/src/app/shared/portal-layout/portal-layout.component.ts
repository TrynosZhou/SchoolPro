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

  /** Section headings that are expanded in the sidebar. */
  readonly expandedSections = signal<Set<string>>(new Set());

  get useSections(): boolean {
    return this.navSections.length > 0;
  }

  ngOnInit(): void {
    this.initExpandedSections();
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.ensureActiveSectionExpanded());
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  get fullName(): string {
    const u = this.auth.user();
    return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User';
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

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
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

  isExpanded(heading: string): boolean {
    return this.expandedSections().has(heading);
  }

  toggleSection(heading: string): void {
    this.expandedSections.update((set) => {
      const next = new Set(set);
      if (next.has(heading)) {
        next.delete(heading);
      } else {
        next.add(heading);
      }
      return next;
    });
  }

  sectionHasActive(section: NavSection): boolean {
    if (section.path && this.isNavItemActive(section.path)) return true;
    return section.items.some((item) => this.isNavItemActive(item.path));
  }

  private initExpandedSections(): void {
    const activeHeadings = this.navSections
      .filter((s) => this.sectionHasActive(s))
      .map((s) => s.heading);

    if (activeHeadings.length) {
      this.expandedSections.set(new Set(activeHeadings));
      return;
    }

    const dashboard = this.navSections.find((s) => s.heading === 'Dashboard');
    this.expandedSections.set(new Set([dashboard?.heading ?? this.navSections[0]?.heading].filter(Boolean) as string[]));
  }

  /** Keep the section for the current route open without collapsing others the user opened. */
  private ensureActiveSectionExpanded(): void {
    const activeHeadings = this.navSections
      .filter((s) => this.sectionHasActive(s))
      .map((s) => s.heading);
    if (!activeHeadings.length) return;

    this.expandedSections.update((set) => {
      const next = new Set(set);
      for (const heading of activeHeadings) {
        next.add(heading);
      }
      return next;
    });
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
    if (h === 'students' || h === 'staff' || h === 'attendance' || h === 'communication') return 'People';
    if (h === 'academics' || h === 'examination' || h === 'examinations' || h === 'timetable') return 'Learning';
    if (h === 'finance' || h === 'fin.reports') return 'Finance';
    return 'Administration';
  }

  sectionIconKey(heading: string): string {
    const h = heading.toLowerCase();
    if (h === 'overview' || h === 'dashboard') return 'dashboard';
    if (h === 'students') return 'students';
    if (h === 'attendance') return 'attendance';
    if (h === 'staff') return 'staff';
    if (h === 'academics' || h === 'examination' || h === 'examinations') return 'examinations';
    if (h === 'finance') return 'finance';
    if (h === 'fin.reports' || h === 'fin. reports') return 'fin-reports';
    if (h === 'communication') return 'communication';
    if (h === 'timetable') return 'timetable';
    if (h === 'system admin') return 'system-admin';
    return 'default';
  }
}
