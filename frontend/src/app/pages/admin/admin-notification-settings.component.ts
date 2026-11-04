import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Channels { inApp: boolean; email: boolean; sms: boolean }
interface NotificationSettings {
  absenceAlerts: { enabled: boolean; channels: Channels; template: string };
  feeReminders: {
    enabled: boolean;
    channels: Channels;
    daysBefore: number[];
    overdueEnabled: boolean;
    overdueEveryDays: number;
    template: string;
    overdueTemplate: string;
  };
  examResults: { enabled: boolean; channels: Channels; template: string };
  dailyRunHour: number;
}

@Component({
  selector: 'app-admin-notification-settings',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-notification-settings.component.html',
  styleUrl: './admin-notification-settings.component.scss',
})
export class AdminNotificationSettingsComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  model = signal<NotificationSettings | null>(null);
  daysBeforeText = '';
  loading = signal(true);
  saving = signal(false);
  runningReminders = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  ngOnInit(): void {
    this.api.get<NotificationSettings>('/communication/notification-settings').subscribe({
      next: (s) => {
        this.model.set(s);
        this.daysBeforeText = (s.feeReminders?.daysBefore || []).join(', ');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load notification settings.');
      },
    });
  }

  save(): void {
    const m = this.model();
    if (!m) return;
    const daysBefore = this.daysBeforeText
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    m.feeReminders.daysBefore = daysBefore.length ? daysBefore : [3];

    this.saving.set(true);
    this.api.patch<NotificationSettings>('/communication/notification-settings', m).subscribe({
      next: (s) => {
        this.model.set(s);
        this.daysBeforeText = (s.feeReminders?.daysBefore || []).join(', ');
        this.saving.set(false);
        this.showToast('success', 'Notification settings saved.');
      },
      error: (e) => {
        this.saving.set(false);
        this.showToast('error', e?.error?.message || 'Could not save settings.');
      },
    });
  }

  runReminders(): void {
    this.runningReminders.set(true);
    this.api.post<{ message: string }>('/communication/fee-reminders/run', {}).subscribe({
      next: (res) => {
        this.runningReminders.set(false);
        this.showToast('success', res.message || 'Fee reminder scan complete.');
      },
      error: (e) => {
        this.runningReminders.set(false);
        this.showToast('error', e?.error?.message || 'Could not run fee reminders.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
