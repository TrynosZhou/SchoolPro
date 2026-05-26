import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
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
  private routerSub?: Subscription;

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

    const overview = this.navSections.find((s) => s.heading === 'Overview');
    this.expandedSections.set(new Set([overview?.heading ?? this.navSections[0]?.heading].filter(Boolean) as string[]));
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
}
