import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  AttendanceRegisterReminderService,
  UnmarkedClassRow,
} from '../../core/services/attendance-register-reminder.service';
import { buildWhatsAppUrl } from '../../core/utils/whatsapp.util';

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

  readonly isAdminView = computed(() => this.reminderService.isAdminView());

  readonly markRegisterPath = computed(() => {
    const role = this.auth.user()?.role;
    if (role === 'teacher') return '/teacher/attendance/mark-register';
    if (role === 'director') return '/director/attendance';
    if (role === 'principal') return '/principal/attendance';
    return '/admin/attendance/mark-register';
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const loggedIn = this.auth.isLoggedIn();
      if (loggedIn && user && this.isReminderRole(user.role)) {
        this.reminderService.start();
      } else {
        this.reminderService.stop();
      }
    });
  }

  classLabel(row: UnmarkedClassRow): string {
    return this.reminderService.classLabel(row);
  }

  whatsappUrl(row: UnmarkedClassRow): string | null {
    if (!this.isAdminView() || !row.classTeacherPhone) return null;
    const teacher = row.classTeacherName?.split(' ')[0] || 'there';
    const message = `Hi ${teacher}, please mark today's attendance register for ${this.classLabel(row)}. Thank you.`;
    const url = buildWhatsAppUrl(row.classTeacherPhone, message);
    return url || null;
  }

  dismiss(): void {
    this.reminderService.dismiss();
  }

  private isReminderRole(role: string): boolean {
    return role === 'admin' || role === 'director' || role === 'principal' || role === 'teacher';
  }
}
