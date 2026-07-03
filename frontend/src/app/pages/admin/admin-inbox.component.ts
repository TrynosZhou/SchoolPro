import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';

interface MessageUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface MessageAttachmentRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
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
  attachments?: MessageAttachmentRow[];
}

type InboxTab = 'inbox' | 'sent';
type InboxFilter = 'all' | 'unread' | 'student';
type SortOrder = 'newest' | 'oldest';

@Component({
  selector: 'app-admin-inbox',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-inbox.component.html',
  styleUrl: './admin-inbox.component.scss',
})
export class AdminInboxComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private messageBadge = inject(MessageBadgeService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  inbox = signal<MessageRow[]>([]);
  sent = signal<MessageRow[]>([]);
  loading = signal(true);
  refreshing = signal(false);
  deleting = signal(false);
  selected = signal<MessageRow | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  tab = signal<InboxTab>('inbox');
  filter = signal<InboxFilter>('all');
  sortOrder = signal<SortOrder>('newest');
  search = signal('');

  unreadCount = computed(() => this.inbox().filter((m) => !m.isRead).length);
  studentLinkedCount = computed(() => {
    const list = this.tab() === 'inbox' ? this.inbox() : this.sent();
    return list.filter((m) => Boolean(m.student)).length;
  });

  visibleMessages = computed(() => {
    let list = this.tab() === 'inbox' ? [...this.inbox()] : [...this.sent()];
    const q = this.search().trim().toLowerCase();
    const f = this.filter();

    if (f === 'unread' && this.tab() === 'inbox') {
      list = list.filter((m) => !m.isRead);
    } else if (f === 'student') {
      list = list.filter((m) => Boolean(m.student));
    }

    if (q) {
      list = list.filter((m) => {
        const person = this.tab() === 'inbox' ? m.sender : m.recipient;
        const haystack = [
          m.subject,
          m.body,
          person.firstName,
          person.lastName,
          person.email,
          person.role,
          m.student?.firstName,
          m.student?.lastName,
          m.student?.admissionNumber,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    list.sort((a, b) => {
      const at = new Date(a.sentAt).getTime();
      const bt = new Date(b.sentAt).getTime();
      return this.sortOrder() === 'newest' ? bt - at : at - bt;
    });

    return list;
  });

  ngOnInit() {
    this.loadMessages();
  }

  loadMessages(silent = false) {
    if (silent) this.refreshing.set(true);
    else this.loading.set(true);

    let inboxDone = false;
    let sentDone = false;
    const finish = () => {
      if (inboxDone && sentDone) {
        this.loading.set(false);
        this.refreshing.set(false);
        this.messageBadge.refresh();
      }
    };

    this.api.get<MessageRow[]>('/academics/messages/inbox').subscribe({
      next: (rows) => {
        this.inbox.set(rows);
        inboxDone = true;
        finish();
      },
      error: () => {
        this.inbox.set([]);
        inboxDone = true;
        finish();
      },
    });

    this.api.get<MessageRow[]>('/academics/messages/sent').subscribe({
      next: (rows) => {
        this.sent.set(rows);
        sentDone = true;
        finish();
      },
      error: () => {
        sentDone = true;
        finish();
      },
    });
  }

  setTab(next: InboxTab) {
    this.tab.set(next);
    this.filter.set('all');
    this.selected.set(null);
  }

  setFilter(next: InboxFilter) {
    this.filter.set(next);
  }

  toggleSort() {
    this.sortOrder.update((v) => (v === 'newest' ? 'oldest' : 'newest'));
  }

  openMessage(msg: MessageRow) {
    this.selected.set(msg);
    if (this.tab() === 'inbox' && !msg.isRead) {
      this.api.patch<MessageRow>(`/academics/messages/${msg.id}/read`, {}).subscribe({
        next: (updated) => {
          this.inbox.update((rows) => rows.map((m) => (m.id === updated.id ? updated : m)));
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
    const target = this.tab() === 'inbox' ? msg.sender : msg.recipient;
    const subject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
    this.router.navigate(['/admin/communication/send'], {
      queryParams: {
        mode: 'individual',
        recipientId: target.id,
        subject,
        studentId: msg.student?.id || undefined,
      },
    });
  }

  deleteMessage(msg: MessageRow) {
    if (!confirm('Delete this message permanently?')) return;
    this.deleting.set(true);
    this.api.delete(`/academics/messages/${msg.id}`).subscribe({
      next: () => {
        this.deleting.set(false);
        if (this.tab() === 'inbox') {
          this.inbox.update((rows) => rows.filter((m) => m.id !== msg.id));
        } else {
          this.sent.update((rows) => rows.filter((m) => m.id !== msg.id));
        }
        if (this.selected()?.id === msg.id) this.selected.set(null);
        this.showToast('success', 'Message deleted.');
      },
      error: (e) => {
        this.deleting.set(false);
        this.showToast('error', e.error?.message || 'Failed to delete message');
      },
    });
  }

  personName(u?: MessageUser): string {
    return u ? `${u.firstName} ${u.lastName}` : '—';
  }

  roleLabel(role?: string): string {
    const map: Record<string, string> = {
      parent: 'Parent',
      teacher: 'Teacher',
      admin: 'Admin',
      director: 'Director',
      principal: 'Principal',
      student: 'Student',
    };
    return role ? map[role] || role : 'User';
  }

  roleIcon(role?: string): string {
    const map: Record<string, string> = {
      parent: '👨‍👩‍👧',
      teacher: '👩‍🏫',
      admin: '⚙️',
      director: '🎯',
      principal: '🏛️',
      student: '🎓',
    };
    return role ? map[role] || '👤' : '👤';
  }

  snippet(body: string, max = 96): string {
    const flat = body.replace(/\s+/g, ' ').trim();
    return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
  }

  relativeDate(value: string): string {
    const date = new Date(value);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  counterparty(msg: MessageRow): MessageUser {
    return this.tab() === 'inbox' ? msg.sender : msg.recipient;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  downloadAttachment(att: MessageAttachmentRow) {
    this.api.getBlob(`/academics/messages/attachments/${att.id}`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = att.originalName;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.showToast('error', 'Could not download attachment'),
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
