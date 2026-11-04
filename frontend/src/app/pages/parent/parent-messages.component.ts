import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';

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

const SCHOOL_SENDER_ROLES = new Set(['admin', 'director', 'principal']);

@Component({
  selector: 'app-parent-messages',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './parent-messages.component.html',
  styleUrl: './parent-messages.component.scss',
})
export class ParentMessagesComponent implements OnInit {
  private api = inject(ApiService);
  private messageBadge = inject(MessageBadgeService);
  private router = inject(Router);
  readonly nav = PARENT_NAV_ITEMS;

  messages = signal<MessageRow[]>([]);
  loading = signal(true);
  selected = signal<MessageRow | null>(null);
  filterUnreadOnly = false;

  unreadCount = computed(() => this.messages().filter((m) => !m.isRead).length);

  visibleMessages = computed(() => {
    const list = this.messages();
    if (this.filterUnreadOnly) {
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
      next: (rows) => {
        this.messages.set(rows);
        this.loading.set(false);
        this.messageBadge.refresh();
      },
      error: () => {
        this.messages.set([]);
        this.loading.set(false);
      },
    });
  }

  openMessage(msg: MessageRow) {
    this.selected.set(msg);
    if (!msg.isRead) {
      this.api.patch<MessageRow>(`/academics/messages/${msg.id}/read`, {}).subscribe({
        next: (updated) => {
          this.messages.update((rows) => rows.map((m) => (m.id === updated.id ? updated : m)));
          this.selected.set(updated);
          this.messageBadge.refresh();
        },
      });
    }
  }

  closeDetail() {
    this.selected.set(null);
  }

  replyTo(msg: MessageRow) {
    const subject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
    this.router.navigate(['/parent/send-email'], {
      queryParams: {
        recipientEmail: msg.sender?.email || undefined,
        subject,
        studentId: msg.student?.id || undefined,
      },
    });
  }

  isSchoolAnnouncement(msg: MessageRow): boolean {
    return SCHOOL_SENDER_ROLES.has((msg.sender?.role || '').toLowerCase());
  }

  senderLabel(msg: MessageRow): string {
    if (this.isSchoolAnnouncement(msg)) {
      return 'School Administration';
    }
    const s = msg.sender;
    return s ? `${s.firstName} ${s.lastName}` : '—';
  }
}
