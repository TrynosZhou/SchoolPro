import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent, NavItem, NavSection } from '../portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { STUDENT_NAV_ITEMS } from '../../core/config/student-nav';
import { DIRECTOR_NAV_ITEMS } from '../../core/config/director-nav';
import { PRINCIPAL_NAV_ITEMS } from '../../core/config/principal-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

const TYPE_META: Record<string, { icon: string; label: string }> = {
  message_received: { icon: '💬', label: 'Message' },
  absence_alert: { icon: '🚫', label: 'Absence' },
  fee_reminder: { icon: '💳', label: 'Fees' },
  results_published: { icon: '🎓', label: 'Results' },
};

/** Shared in-app notification feed for every portal. */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [PortalLayoutComponent, DatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly role = (this.auth.user()?.role || '').toLowerCase();

  notifications = signal<AppNotification[]>([]);
  loading = signal(true);
  filterUnread = signal(false);

  unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);
  visible = computed(() =>
    this.filterUnread() ? this.notifications().filter((n) => !n.isRead) : this.notifications(),
  );

  get portalTitle(): string {
    switch (this.role) {
      case 'teacher': return 'Teacher Portal';
      case 'admin': return 'Admin Portal';
      case 'director': return 'Director Portal';
      case 'principal': return 'Principal Portal';
      case 'student': return 'Student Portal';
      default: return 'Parent Portal';
    }
  }

  get navItems(): NavItem[] {
    switch (this.role) {
      case 'director': return DIRECTOR_NAV_ITEMS;
      case 'principal': return PRINCIPAL_NAV_ITEMS;
      case 'student': return STUDENT_NAV_ITEMS;
      case 'parent': return PARENT_NAV_ITEMS;
      default: return [];
    }
  }

  get navSections(): NavSection[] {
    switch (this.role) {
      case 'admin': return ADMIN_NAV_SECTIONS;
      case 'teacher': return buildTeacherNavSections(this.auth.user()?.permissions);
      default: return [];
    }
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<AppNotification[]>('/communication/notifications').subscribe({
      next: (rows) => {
        this.notifications.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.notifications.set([]);
        this.loading.set(false);
      },
    });
  }

  meta(type: string): { icon: string; label: string } {
    return TYPE_META[type] || { icon: '🔔', label: 'Notice' };
  }

  markRead(n: AppNotification): void {
    if (n.isRead) return;
    this.api.patch(`/communication/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        );
      },
    });
  }

  markAllRead(): void {
    this.api.post('/communication/notifications/read-all', {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((x) => ({ ...x, isRead: true })));
      },
    });
  }

  toggleFilter(): void {
    this.filterUnread.update((v) => !v);
  }
}
