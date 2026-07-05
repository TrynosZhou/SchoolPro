import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class MessageBadgeService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly unreadCount = signal(0);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  refresh(): void {
    if (!this.auth.isLoggedIn()) {
      this.unreadCount.set(0);
      return;
    }
    const role = (this.auth.user()?.role || '').toLowerCase();
    if (!this.roleHasInbox(role)) {
      this.unreadCount.set(0);
      return;
    }

    this.api.get<{ count: number }>('/academics/messages/unread-count').subscribe({
      next: (res) => this.unreadCount.set(Math.max(0, Number(res.count || 0))),
      error: () => this.unreadCount.set(0),
    });
  }

  startPolling(intervalMs = 60_000): void {
    this.stopPolling();
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  roleHasInbox(role: string): boolean {
    return ['admin', 'director', 'principal', 'teacher', 'parent', 'student'].includes(role);
  }

  messagesPathForRole(role: string): string {
    switch (role) {
      case 'admin':
        return '/admin/communication/inbox';
      case 'student':
        return '/student/messages';
      case 'parent':
        return '/parent/messages';
      case 'teacher':
        return '/teacher/messages';
      default:
        return '';
    }
  }
}
