import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AttendanceRegisterReminderComponent } from './shared/attendance-register-reminder/attendance-register-reminder.component';
import { DemoModeBannerComponent } from './shared/demo-mode-banner/demo-mode-banner.component';
import { DemoOnboardingTourComponent } from './shared/demo-onboarding-tour/demo-onboarding-tour.component';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AttendanceRegisterReminderComponent, DemoModeBannerComponent, DemoOnboardingTourComponent],
  template: `
    <app-demo-mode-banner />
    <router-outlet />
    <app-attendance-register-reminder />
    <app-demo-onboarding-tour />
  `,
  styles: [`:host { display: block; min-height: 100vh; }`],
})
export class AppComponent {
  /** Eagerly construct so theme/font prefs apply before first paint settles. */
  private readonly theme = inject(ThemeService);
}
