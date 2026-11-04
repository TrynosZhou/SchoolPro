import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { DemoAccount, UserRole } from '../../core/models';

const ROLE_ICONS: Record<UserRole, string> = {
  admin: '🛡️',
  accountant: '💼',
  teacher: '👩‍🏫',
  parent: '👪',
  student: '🎓',
  director: '🏛️',
  principal: '🏫',
};

@Component({
  selector: 'app-demo-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './demo-landing.component.html',
  styleUrl: './demo-landing.component.scss',
})
export class DemoLandingComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly accounts = signal<DemoAccount[]>([]);
  readonly loading = signal(true);
  readonly unavailable = signal(false);
  readonly loggingInRole = signal<UserRole | null>(null);
  readonly error = signal('');

  ngOnInit(): void {
    if (this.auth.isLoggedIn() && !this.auth.isDemoSession()) {
      void this.router.navigate([this.auth.getPortalRoute()]);
      return;
    }

    this.api.get<{ accounts: DemoAccount[] }>('/auth/demo-accounts').subscribe({
      next: (res) => {
        this.accounts.set(res.accounts);
        this.loading.set(false);
      },
      error: () => {
        this.unavailable.set(true);
        this.loading.set(false);
      },
    });
  }

  roleIcon(role: UserRole): string {
    return ROLE_ICONS[role] || '✨';
  }

  loginAs(account: DemoAccount): void {
    if (this.loggingInRole()) return;
    this.error.set('');
    this.loggingInRole.set(account.role);

    this.auth.demoLogin(account.role).subscribe({
      next: () => void this.router.navigate([this.auth.getPortalRoute()]),
      error: (e) => {
        this.error.set(e.error?.message || 'Could not start the demo session. Please try again.');
        this.loggingInRole.set(null);
      },
      complete: () => this.loggingInRole.set(null),
    });
  }
}
