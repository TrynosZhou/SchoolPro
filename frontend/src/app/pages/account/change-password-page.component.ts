import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ChangePasswordFormComponent } from '../../shared/change-password/change-password-form.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_ITEMS } from '../../core/config/student-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { DIRECTOR_NAV_ITEMS } from '../../core/config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../../core/config/principal-nav';
import { AuthService } from '../../core/services/auth.service';
import type { NavItem, NavSection } from '../../shared/portal-layout/portal-layout.component';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [PortalLayoutComponent, ChangePasswordFormComponent],
  template: `
    <app-portal-layout
      [portalTitle]="portalTitle"
      pageTitle="Change Password"
      [homePath]="homePath"
      [navSections]="navSections"
      [navItems]="navItems"
    >
      <section class="change-password-page card">
        <header class="page-head">
          <h2>Change password</h2>
          <p>Update your portal login password. After changing it, sign in with your Student ID and new password instead of your date of birth.</p>
        </header>
        <app-change-password-form />
      </section>
    </app-portal-layout>
  `,
  styles: [`
    .change-password-page {
      padding: 1.25rem 1.5rem 1.5rem;
      max-width: 42rem;
    }
    .page-head {
      margin-bottom: 1.25rem;
    }
    .page-head h2 {
      margin: 0 0 0.35rem;
      font-size: 1.25rem;
      color: #0f172a;
    }
    .page-head p {
      margin: 0;
      color: #64748b;
      font-size: 0.92rem;
      line-height: 1.45;
    }
  `],
})
export class ChangePasswordPageComponent {
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly portalTitle = this.resolvePortalTitle();
  readonly homePath = this.resolveHomePath();
  readonly navSections: NavSection[] = this.resolveNavSections();
  readonly navItems: NavItem[] = this.resolveNavItems();

  private resolvePortalTitle(): string {
    const url = this.router.url;
    if (url.startsWith('/teacher')) return 'Teacher Portal';
    if (url.startsWith('/parent')) return 'Parent Portal';
    if (url.startsWith('/student')) return 'Student Portal';
    if (url.startsWith('/director')) return 'Director Portal';
    if (url.startsWith('/principal')) return 'Principal Portal';
    return 'Admin Portal';
  }

  private resolveHomePath(): string {
    const url = this.router.url;
    if (url.startsWith('/teacher')) return '/teacher';
    if (url.startsWith('/parent')) return '/parent';
    if (url.startsWith('/student')) return '/student';
    if (url.startsWith('/director')) return '/director';
    if (url.startsWith('/principal')) return '/principal';
    return '/admin';
  }

  private resolveNavSections(): NavSection[] {
    const url = this.router.url;
    if (url.startsWith('/teacher')) {
      return buildTeacherNavSections(this.auth.user()?.permissions);
    }
    if (url.startsWith('/admin')) {
      return ADMIN_NAV_SECTIONS;
    }
    return [];
  }

  private resolveNavItems(): NavItem[] {
    const url = this.router.url;
    if (url.startsWith('/parent')) return PARENT_NAV_ITEMS;
    if (url.startsWith('/student')) return STUDENT_NAV_ITEMS;
    if (url.startsWith('/director')) return DIRECTOR_NAV_ITEMS;
    if (url.startsWith('/principal')) return PRINCIPAL_NAV_ITEMS;
    return [];
  }
}
