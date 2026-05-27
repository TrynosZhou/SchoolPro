import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface MessageUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface MessageRow {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  sentAt: string;
  sender: MessageUser;
  recipient: MessageUser;
  student?: { id: string; firstName: string; lastName: string; admissionNumber: string };
}

@Component({
  selector: 'app-admin-inbox',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-inbox.component.html',
  styleUrl: './admin-communication.component.scss',
})
export class AdminInboxComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  inbox = signal<MessageRow[]>([]);
  sent = signal<MessageRow[]>([]);
  loading = signal(true);
  selected = signal<MessageRow | null>(null);
  tab: 'inbox' | 'sent' = 'inbox';
  filterUnreadOnly = false;

  unreadCount = computed(() => this.inbox().filter((m) => !m.isRead).length);

  visibleMessages = computed(() => {
    const list = this.tab === 'inbox' ? this.inbox() : this.sent();
    if (this.tab === 'inbox' && this.filterUnreadOnly) {
      return list.filter((m) => !m.isRead);
    }
    return list;
  });

  ngOnInit() {
    this.loadMessages();
  }

  loadMessages() {
    this.loading.set(true);
    this.api.get<MessageRow[]>('/academics/messages/inbox').subscribe({
      next: (rows) => this.inbox.set(rows),
      error: () => this.inbox.set([]),
    });
    this.api.get<MessageRow[]>('/academics/messages/sent').subscribe({
      next: (rows) => {
        this.sent.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openMessage(msg: MessageRow) {
    this.selected.set(msg);
    if (this.tab === 'inbox' && !msg.isRead) {
      this.api.patch<MessageRow>(`/academics/messages/${msg.id}/read`, {}).subscribe({
        next: (updated) => {
          this.inbox.update((rows) => rows.map((m) => (m.id === updated.id ? updated : m)));
          this.selected.set(updated);
        },
      });
    }
  }

  closeDetail() {
    this.selected.set(null);
  }

  personName(u?: MessageUser): string {
    return u ? `${u.firstName} ${u.lastName}` : '—';
  }
}
