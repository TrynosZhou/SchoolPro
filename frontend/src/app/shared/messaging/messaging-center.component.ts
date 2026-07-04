import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PortalLayoutComponent, NavItem, NavSection } from '../portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';

interface MessagingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface ThreadSummary {
  threadId: string;
  counterpart: MessagingUser | null;
  lastMessage: { subject: string; body: string; sentAt: string; fromMe: boolean };
  unreadCount: number;
}

interface ThreadMessage {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  sentAt: string;
  senderId: string;
  recipientId: string;
  sender: MessagingUser;
  recipient: MessagingUser;
  student?: { id: string; firstName: string; lastName: string } | null;
}

interface Recipient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  context?: string;
}

/**
 * Shared threaded messaging center for parent-teacher (and student) messaging.
 * Recipients are restricted by the backend to the people a user is allowed to
 * contact (a parent's assigned teachers / the office; a teacher's parents & students).
 */
@Component({
  selector: 'app-messaging-center',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './messaging-center.component.html',
  styleUrl: './messaging-center.component.scss',
})
export class MessagingCenterComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private badge = inject(MessageBadgeService);
  private route = inject(ActivatedRoute);

  readonly role = (this.auth.user()?.role || '').toLowerCase();
  readonly meId = this.auth.user()?.id || '';

  threads = signal<ThreadSummary[]>([]);
  loadingThreads = signal(true);

  activeThread = signal<ThreadSummary | null>(null);
  threadMessages = signal<ThreadMessage[]>([]);
  loadingThread = signal(false);
  replyBody = '';
  sendingReply = signal(false);

  showCompose = signal(false);
  recipients = signal<Recipient[]>([]);
  recipientsLoaded = signal(false);
  recipientSearch = '';
  composeRecipientId = '';
  composeSubject = '';
  composeBody = '';
  sending = signal(false);

  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  get isTeacher(): boolean {
    return this.role === 'teacher';
  }

  get portalTitle(): string {
    if (this.isTeacher) return 'Teacher Portal';
    return this.role === 'student' ? 'Student Portal' : 'Parent Portal';
  }

  get navItems(): NavItem[] {
    return this.isTeacher ? [] : PARENT_NAV_ITEMS;
  }

  get navSections(): NavSection[] {
    return this.isTeacher ? TEACHER_NAV_SECTIONS : [];
  }

  private get recipientsEndpoint(): string {
    return this.isTeacher
      ? '/academics/messages/teacher-recipients'
      : '/academics/messages/staff-recipients';
  }

  filteredRecipients = computed(() => {
    const term = this.recipientSearch.trim().toLowerCase();
    const list = this.recipients();
    if (!term) return list;
    return list.filter((r) =>
      `${r.firstName} ${r.lastName} ${r.email} ${r.context || ''} ${r.role}`
        .toLowerCase()
        .includes(term),
    );
  });

  totalUnread = computed(() => this.threads().reduce((sum, t) => sum + t.unreadCount, 0));

  ngOnInit(): void {
    this.loadThreads();
    this.route.queryParamMap.subscribe((p) => {
      if (p.get('compose') === '1' || p.get('recipientId')) {
        this.openCompose(p.get('recipientId') || '');
      }
    });
  }

  loadThreads(): void {
    this.loadingThreads.set(true);
    this.api.get<ThreadSummary[]>('/academics/messages/threads').subscribe({
      next: (rows) => {
        this.threads.set(rows);
        this.loadingThreads.set(false);
        this.badge.refresh();
      },
      error: () => {
        this.threads.set([]);
        this.loadingThreads.set(false);
      },
    });
  }

  openThread(t: ThreadSummary): void {
    this.activeThread.set(t);
    this.showCompose.set(false);
    this.loadingThread.set(true);
    this.replyBody = '';
    this.api.get<ThreadMessage[]>(`/academics/messages/threads/${t.threadId}`).subscribe({
      next: (rows) => {
        this.threadMessages.set(rows);
        this.loadingThread.set(false);
        // Reflect read state locally.
        this.threads.update((list) =>
          list.map((x) => (x.threadId === t.threadId ? { ...x, unreadCount: 0 } : x)),
        );
        this.badge.refresh();
      },
      error: () => {
        this.threadMessages.set([]);
        this.loadingThread.set(false);
      },
    });
  }

  counterpartName(t: ThreadSummary | null): string {
    if (!t?.counterpart) return 'Unknown';
    return `${t.counterpart.firstName} ${t.counterpart.lastName}`.trim();
  }

  counterpartRole(t: ThreadSummary | null): string {
    const r = t?.counterpart?.role;
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
  }

  isMine(m: ThreadMessage): boolean {
    return m.senderId === this.meId;
  }

  sendReply(): void {
    const thread = this.activeThread();
    const body = this.replyBody.trim();
    if (!thread?.counterpart || !body) return;
    const lastSubject = this.threadMessages().at(-1)?.subject || 'Message';
    const subject = lastSubject.toLowerCase().startsWith('re:') ? lastSubject : `Re: ${lastSubject}`;
    this.sendingReply.set(true);
    this.api
      .post('/academics/messages', {
        recipientId: thread.counterpart.id,
        subject,
        body,
      })
      .subscribe({
        next: () => {
          this.replyBody = '';
          this.sendingReply.set(false);
          this.openThread(thread);
          this.loadThreads();
        },
        error: (e) => {
          this.sendingReply.set(false);
          this.showToast('error', e?.error?.message || 'Could not send your reply.');
        },
      });
  }

  openCompose(recipientId = ''): void {
    this.showCompose.set(true);
    this.activeThread.set(null);
    this.composeRecipientId = recipientId;
    this.composeSubject = '';
    this.composeBody = '';
    if (!this.recipientsLoaded()) this.loadRecipients();
  }

  loadRecipients(): void {
    this.api.get<Recipient[]>(this.recipientsEndpoint).subscribe({
      next: (rows) => {
        this.recipients.set(rows);
        this.recipientsLoaded.set(true);
      },
      error: () => {
        this.recipients.set([]);
        this.recipientsLoaded.set(true);
      },
    });
  }

  selectRecipient(id: string): void {
    this.composeRecipientId = id;
  }

  selectedRecipient = computed(() => {
    const id = this.composeRecipientId;
    return this.recipients().find((r) => r.id === id) || null;
  });

  sendCompose(): void {
    const subject = this.composeSubject.trim();
    const body = this.composeBody.trim();
    if (!this.composeRecipientId) {
      this.showToast('error', 'Choose someone to message.');
      return;
    }
    if (!subject || !body) {
      this.showToast('error', 'Enter a subject and a message.');
      return;
    }
    this.sending.set(true);
    this.api
      .post('/academics/messages', { recipientId: this.composeRecipientId, subject, body })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.showCompose.set(false);
          this.showToast('success', 'Message sent.');
          this.loadThreads();
        },
        error: (e) => {
          this.sending.set(false);
          this.showToast('error', e?.error?.message || 'Could not send your message.');
        },
      });
  }

  cancelCompose(): void {
    this.showCompose.set(false);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
