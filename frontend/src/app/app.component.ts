import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AttendanceRegisterReminderComponent } from './shared/attendance-register-reminder/attendance-register-reminder.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AttendanceRegisterReminderComponent],
  template: `
    <router-outlet />
    <app-attendance-register-reminder />
  `,
  styles: [`:host { display: block; min-height: 100vh; }`],
})
export class AppComponent {}
