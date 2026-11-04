import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ACCOUNTANT_NAV_SECTIONS } from '../../core/config/accountant-nav';
import { AuthService } from '../../core/services/auth.service';
import { changePasswordDashboardLink } from '../../core/utils/change-password-route.util';

@Component({
  selector: 'app-accountant-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, RouterLink],
  templateUrl: './accountant-dashboard.component.html',
  styleUrl: './accountant-dashboard.component.scss',
})
export class AccountantDashboardComponent implements OnInit {
  private auth = inject(AuthService);

  readonly nav = ACCOUNTANT_NAV_SECTIONS;
  readonly changePasswordLink = changePasswordDashboardLink('accountant');

  greetingName = signal('Accountant');

  ngOnInit() {
    const u = this.auth.user();
    if (u) {
      this.greetingName.set(`${u.firstName} ${u.lastName}`.trim() || 'Accountant');
    }
  }
}
