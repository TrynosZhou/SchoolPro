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
        <header class="letterhead">
          <p class="eyebrow">{{ portalTitle }} · Account security</p>
          <h1 class="lh-title">Change password</h1>
          <p class="lh-sub">Update your account password to keep your portal access secure.</p>
        </header>

        <div class="layout">
          <section class="panel form-panel">
            <div class="panel-head">
              <span class="seal" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </span>
              <div>
                <h2>Password information</h2>
                <p>Ensure your new password meets the security requirements.</p>
              </div>
            </div>
            <div class="panel-body">
              <app-change-password-form />
            </div>
          </section>

          <aside class="panel tips-panel">
            <div class="panel-head panel-head--compact">
              <h2>Keeping your account safe</h2>
            </div>
            <ul class="tips-list">
              <li>Choose a password you do not use on any other website or app.</li>
              <li>Longer is stronger: a short phrase of several words works well.</li>
              <li>Never share your password with anyone, including school staff.</li>
              <li>Sign out when using a shared or public computer.</li>
            </ul>
          </aside>
        </div>
      </div>
    </app-portal-layout>
  `,
  styles: [`
    :host {
      display: block;
      --navy: #0f1d36;
      --brass: #b8924a;
      --brass-ink: #7a5a1f;
      --brass-line: rgba(184, 146, 74, 0.5);
      --heading: var(--navy);
      --paper: var(--color-bg, #fff);
      --wash: #fbf9f4;
      --rule: var(--color-border, #e4e4e7);
      --rule-strong: var(--color-border-strong, #d4d4d8);
      --ink-2: var(--color-text-secondary, #52525b);
      --serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
      --numeric: 'Source Serif 4', 'Cormorant Garamond', Georgia, serif;
    }

    :host-context([data-theme='dark']) {
      --heading: #e9eef8;
      --wash: var(--color-bg-subtle, #18181b);
      --brass-ink: #d3b377;
    }

    .page-container {
      max-width: 64rem;
      margin: 0 auto;
    }

    .letterhead {
      position: relative;
      margin-bottom: 1.5rem;
      padding: 1.5rem 2rem 1.7rem;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-top: 3px solid var(--brass);
      border-radius: 3px;
      overflow: hidden;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 11rem;
        height: 100%;
        background: repeating-linear-gradient(135deg, rgba(184, 146, 74, 0.1) 0, rgba(184, 146, 74, 0.1) 1px, transparent 1px, transparent 9px);
        -webkit-mask-image: linear-gradient(to left, #000, transparent);
        mask-image: linear-gradient(to left, #000, transparent);
        pointer-events: none;
      }

      > * { position: relative; z-index: 1; }
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--brass-ink);
    }

    .lh-title {
      margin: 0 0 0.5rem;
      font-family: var(--serif);
      font-size: 2.7rem;
      font-weight: 600;
      line-height: 1.04;
      letter-spacing: 0;
      color: var(--heading);
    }

    .lh-sub {
      margin: 0;
      max-width: 38rem;
      font-size: 0.92rem;
      line-height: 1.6;
      color: var(--ink-2);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(250px, 0.8fr);
      gap: 1.25rem;
      align-items: start;
    }

    .panel {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 3px;
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.1rem 1.75rem;
      background: var(--wash);
      border-bottom: 1px solid var(--rule-strong);

      h2 {
        margin: 0;
        font-family: var(--serif);
        font-size: 1.55rem;
        font-weight: 600;
        line-height: 1.1;
        color: var(--heading);
      }

      p {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: var(--ink-2);
      }

      &--compact { padding: 0.9rem 1.25rem; h2 { font-size: 1.35rem; } }
    }

    .seal {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.9rem;
      height: 2.9rem;
      border: 1px solid var(--brass-line);
      border-radius: 50%;
      color: var(--brass-ink);

      svg { width: 1.35rem; height: 1.35rem; }
    }

    .panel-body { padding: 1.75rem; }

    .tips-list {
      margin: 0;
      padding: 0.4rem 1.25rem 0.5rem;
      list-style: none;
      counter-reset: tip;

      li {
        position: relative;
        counter-increment: tip;
        padding: 0.8rem 0 0.8rem 2.1rem;
        border-bottom: 1px solid var(--rule);
        font-size: 0.86rem;
        line-height: 1.55;
        color: var(--ink-2);

        &:last-child { border-bottom: 0; }

        &::before {
          content: counter(tip);
          position: absolute;
          left: 0;
          top: 0.75rem;
          font-family: var(--numeric);
          font-size: 1.2rem;
          font-weight: 600;
          line-height: 1.3;
          color: var(--brass);
        }
      }
    }

    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
    }

    @media (max-width: 640px) {
      .letterhead { padding: 1.25rem 1.1rem 1.4rem; }
      .lh-title { font-size: 2.1rem; }
      .panel-head { padding: 1rem 1.1rem; }
      .panel-body { padding: 1.25rem 1.1rem; }
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
