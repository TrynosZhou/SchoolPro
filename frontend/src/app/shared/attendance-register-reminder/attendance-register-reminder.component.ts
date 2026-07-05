import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  AttendanceRegisterReminderService,
  UnmarkedClassRow,
} from '../../core/services/attendance-register-reminder.service';

@Component({
  selector: 'app-attendance-register-reminder',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './attendance-register-reminder.component.html',
  styleUrl: './attendance-register-reminder.component.scss',
})
export class AttendanceRegisterReminderComponent {
  private auth = inject(AuthService);
  readonly reminderService = inject(AttendanceRegisterReminderService);

  readonly markRegisterPath = computed(() => {
    const role = this.auth.user()?.role;
    if (role === 'director') return '/director/attendance';
    if (role === 'principal') return '/principal/attendance';
    return '/admin/attendance/mark-register';
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const loggedIn = this.auth.isLoggedIn();
      if (loggedIn && user && this.isAdminRole(user.role)) {
        this.reminderService.start();
      } else {
        this.reminderService.stop();
      }
    });
  }

  classLabel(row: UnmarkedClassRow): string {
    return this.reminderService.classLabel(row);
  }

  dismiss(): void {
    this.reminderService.dismiss();
  }

  private isAdminRole(role: string): boolean {
    return role === 'admin' || role === 'director' || role === 'principal';
  }
}
