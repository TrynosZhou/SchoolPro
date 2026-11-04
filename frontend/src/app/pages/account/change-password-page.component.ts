import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ChangePasswordFormComponent } from '../../shared/change-password/change-password-form.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
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
      pageTitle="Security Settings"
      [homePath]="homePath"
      [navSections]="navSections"
      [navItems]="navItems"
    >
      <div class="page-container">
        <header class="settings-header">
          <div class="header-content">
            <h1>Change Password</h1>
            <p>Update your account password to keep your portal access secure.</p>
          </div>
        </header>

        <div class="settings-card">
          <div class="card-header">
            <h3>Password Information</h3>
            <p>Ensure your new password meets the security requirements.</p>
          </div>
          <div class="card-body">
            <app-change-password-form />
          </div>
        </div>
      </div>
    </app-portal-layout>
  `,
  styles: [`
    .page-container {
      max-width: 60rem;
      margin: 0 auto;
      padding: 1.5rem;
    }

    .settings-header {
      margin-bottom: 2rem;
      
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.75rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.025em;
      }

      p {
        margin: 0;
        color: #64748b;
        font-size: 1rem;
      }
    }

    .settings-card {
      background: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      overflow: hidden;

      .card-header {
        padding: 1.5rem 2rem;
        border-bottom: 1px solid #f1f5f9;
        background: #f8fafc;

        h3 {
          margin: 0 0 0.25rem;
          font-size: 1.125rem;
          font-weight: 600;
          color: #1e293b;
        }

        p {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
        }
      }

      .card-body {
        padding: 2rem;
      }
    }

    @media (max-width: 640px) {
      .page-container {
        padding: 1rem;
      }
      .settings-card .card-body {
        padding: 1.5rem;
      }
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
    if (url.startsWith('/student')) {
      return STUDENT_NAV_SECTIONS;
    }
    return [];
  }

  private resolveNavItems(): NavItem[] {
    const url = this.router.url;
    if (url.startsWith('/parent')) return PARENT_NAV_ITEMS;
    if (url.startsWith('/student')) return [];
    if (url.startsWith('/director')) return DIRECTOR_NAV_ITEMS;
    if (url.startsWith('/principal')) return PRINCIPAL_NAV_ITEMS;
    return [];
  }
}
