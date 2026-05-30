import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface RecipientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface StudentRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
}

interface RecipientsResponse {
  recipients: RecipientRow[];
  registeredParentCount: number;
}

interface SentMessageRow {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  recipient: { firstName: string; lastName: string; role: string };
  student?: { firstName: string; lastName: string; admissionNumber: string };
}

interface MessageTemplate {
  id: string;
  label: string;
  icon: string;
  subject: string;
  body: string;
}

type AudienceMode = 'broadcast' | 'individual';
type RoleFilter = 'all' | 'parent' | 'teacher' | 'admin' | 'director' | 'principal' | 'student';

/** Sentinel value for broadcasting to every registered parent account. */
export const ALL_REGISTERED_PARENTS = '__all_registered_parents__';

const DRAFT_KEY = 'school_pro_announcement_draft';

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'fees',
    label: 'Fee reminder',
    icon: '💰',
    subject: 'Reminder: School fees due',
    body:
      'Dear parent/guardian,\n\nThis is a friendly reminder that school fees for the current term are due. Please settle any outstanding balance at your earliest convenience.\n\nThank you for your continued support.',
  },
  {
    id: 'closure',
    label: 'School closure',
    icon: '🏫',
    subject: 'School closure notice',
    body:
      'Dear parent/guardian,\n\nPlease note that the school will be closed on [DATE] due to [REASON]. Normal operations will resume on [DATE].\n\nThank you.',
  },
  {
    id: 'pta',
    label: 'PTA meeting',
    icon: '🤝',
    subject: 'PTA meeting invitation',
    body:
      'Dear parent/guardian,\n\nYou are invited to attend the upcoming PTA meeting scheduled for [DATE] at [TIME] in [VENUE].\n\nYour participation is valued.',
  },
  {
    id: 'exam',
    label: 'Exam schedule',
    icon: '📝',
    subject: 'Upcoming examination schedule',
    body:
      'Dear parent/guardian,\n\nExaminations for the current term will begin on [DATE]. Please ensure your child is prepared and arrives on time each day.\n\nBest wishes.',
  },
];

@Component({
  selector: 'app-admin-send-message',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-send-message.component.html',
  styleUrl: './admin-send-message.component.scss',
})
export class AdminSendMessageComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly allRegisteredParents = ALL_REGISTERED_PARENTS;
  readonly templates = MESSAGE_TEMPLATES;

  recipients = signal<RecipientRow[]>([]);
  registeredParentCount = signal(0);
  students = signal<StudentRow[]>([]);
  recentSent = signal<SentMessageRow[]>([]);
  sending = signal(false);
  loading = signal(true);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  audienceMode = signal<AudienceMode>('broadcast');
  roleFilter = signal<RoleFilter>('all');
  recipientSearch = signal('');
  studentSearch = signal('');

  recipientId = '';
  studentId = '';
  subject = '';
  body = '';

  parentCount = computed(() =>
    this.recipients().filter((r) => r.role === 'parent').length,
  );
  teacherCount = computed(() =>
    this.recipients().filter((r) => r.role === 'teacher').length,
  );
  staffCount = computed(() =>
    this.recipients().filter((r) =>
      ['admin', 'director', 'principal'].includes(r.role),
    ).length,
  );

  filteredRecipients = computed(() => {
    const q = this.recipientSearch().trim().toLowerCase();
    const role = this.roleFilter();
    return this.recipients().filter((r) => {
      if (role !== 'all' && r.role !== role) return false;
      if (!q) return true;
      return `${r.firstName} ${r.lastName} ${r.email} ${r.role}`.toLowerCase().includes(q);
    });
  });

  filteredStudents = computed(() => {
    const q = this.studentSearch().trim().toLowerCase();
    if (!q) return this.students().slice(0, 50);
    return this.students().filter((s) =>
      `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(q),
    ).slice(0, 50);
  });

  selectedRecipient = computed(() =>
    this.recipients().find((r) => r.id === this.recipientId) ?? null,
  );

  selectedStudent = computed(() =>
    this.students().find((s) => s.id === this.studentId) ?? null,
  );

  bodyCharCount = computed(() => this.body.length);
  subjectCharCount = computed(() => this.subject.trim().length);
  canSend = computed(() => {
    if (!this.subject.trim() || !this.body.trim()) return false;
    if (this.audienceMode() === 'broadcast') {
      return this.registeredParentCount() > 0;
    }
    return Boolean(this.recipientId);
  });

  roleFilters: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'parent', label: 'Parents' },
    { value: 'teacher', label: 'Teachers' },
    { value: 'admin', label: 'Admin' },
    { value: 'director', label: 'Director' },
    { value: 'principal', label: 'Principal' },
  ];

  ngOnInit() {
    const reply = this.route.snapshot.queryParamMap;
    const isReply = Boolean(reply.get('recipientId'));
    if (isReply) {
      this.audienceMode.set('individual');
      this.recipientId = reply.get('recipientId') || '';
      this.subject = reply.get('subject') || '';
      this.studentId = reply.get('studentId') || '';
    } else {
      this.restoreDraft();
    }
    this.api.get<RecipientsResponse | RecipientRow[]>('/academics/messages/recipients').subscribe({
      next: (data) => {
        if (Array.isArray(data)) {
          this.recipients.set(data);
          this.registeredParentCount.set(data.filter((r) => r.role === 'parent').length);
        } else {
          this.recipients.set(data.recipients);
          this.registeredParentCount.set(data.registeredParentCount);
        }
      },
      error: () => {
        this.recipients.set([]);
        this.registeredParentCount.set(0);
      },
    });
    this.api.get<StudentRow[]>('/students').subscribe({
      next: (rows) => this.students.set(rows),
      error: () => this.students.set([]),
    });
    this.loadRecentSent();
  }

  isAllParentsBroadcast(): boolean {
    return this.audienceMode() === 'broadcast';
  }

  setAudienceMode(mode: AudienceMode) {
    this.audienceMode.set(mode);
    if (mode === 'broadcast') {
      this.recipientId = this.allRegisteredParents;
      this.studentId = '';
    } else {
      this.recipientId = '';
    }
    this.saveDraft();
  }

  selectRecipient(id: string) {
    this.recipientId = id;
    this.saveDraft();
  }

  applyTemplate(template: MessageTemplate) {
    this.subject = template.subject;
    this.body = template.body;
    this.saveDraft();
    this.showToast('success', `Template "${template.label}" applied.`);
  }

  reuseMessage(msg: SentMessageRow) {
    this.subject = msg.subject;
    this.body = msg.body;
    this.saveDraft();
    this.showToast('success', 'Message loaded into composer.');
  }

  clearForm() {
    this.subject = '';
    this.body = '';
    this.studentId = '';
    if (this.audienceMode() === 'broadcast') {
      this.recipientId = this.allRegisteredParents;
    } else {
      this.recipientId = '';
    }
    this.recipientSearch.set('');
    this.studentSearch.set('');
    localStorage.removeItem(DRAFT_KEY);
    this.showToast('success', 'Composer cleared.');
  }

  saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          audienceMode: this.audienceMode(),
          recipientId: this.recipientId,
          studentId: this.studentId,
          subject: this.subject,
          body: this.body,
        }),
      );
    } catch {
      /* ignore storage errors */
    }
  }

  onFieldChange() {
    this.saveDraft();
  }

  recipientLabel(r: RecipientRow): string {
    return `${r.firstName} ${r.lastName}`;
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      parent: 'Parent',
      teacher: 'Teacher',
      admin: 'Admin',
      director: 'Director',
      principal: 'Principal',
      student: 'Student',
    };
    return map[role] || role;
  }

  roleIcon(role: string): string {
    const map: Record<string, string> = {
      parent: '👨‍👩‍👧',
      teacher: '👩‍🏫',
      admin: '⚙️',
      director: '🎯',
      principal: '🏛️',
      student: '🎓',
    };
    return map[role] || '👤';
  }

  studentLabel(s: StudentRow): string {
    return `${s.firstName} ${s.lastName} (${s.admissionNumber})`;
  }

  previewRecipientLine(): string {
    if (this.isAllParentsBroadcast()) {
      const n = this.registeredParentCount();
      return `All registered parents (${n} recipient${n === 1 ? '' : 's'})`;
    }
    const r = this.selectedRecipient();
    if (!r) return 'Select a recipient';
    return `${this.recipientLabel(r)} · ${this.roleLabel(r.role)}`;
  }

  send() {
    if (!this.canSend()) {
      this.showToast('error', 'Complete all required fields before sending.');
      return;
    }

    if (this.isAllParentsBroadcast() && this.registeredParentCount() === 0) {
      this.showToast('error', 'No registered parents are available to receive this announcement.');
      return;
    }

    if (
      this.isAllParentsBroadcast() &&
      !confirm(
        `Send this announcement to all ${this.registeredParentCount()} registered parent accounts?`,
      )
    ) {
      return;
    }

    this.sending.set(true);
    const isBroadcast = this.isAllParentsBroadcast();
    const payload = isBroadcast
      ? {
          broadcastToAllParents: true,
          subject: this.subject.trim(),
          body: this.body.trim(),
        }
      : {
          recipientId: this.recipientId,
          studentId: this.studentId || undefined,
          subject: this.subject.trim(),
          body: this.body.trim(),
        };

    this.api.post<{ sentCount?: number }>('/academics/messages', payload).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.subject = '';
        this.body = '';
        this.studentId = '';
        if (this.audienceMode() === 'broadcast') {
          this.recipientId = this.allRegisteredParents;
        } else {
          this.recipientId = '';
        }
        localStorage.removeItem(DRAFT_KEY);
        this.loadRecentSent();
        const msg =
          res.sentCount != null
            ? `Announcement sent to ${res.sentCount} registered parent${res.sentCount === 1 ? '' : 's'}.`
            : 'Message sent successfully.';
        this.showToast('success', msg);
      },
      error: (e) => {
        this.sending.set(false);
        this.showToast('error', e.error?.message || 'Failed to send message');
      },
    });
  }

  private restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        this.recipientId = this.allRegisteredParents;
        this.loading.set(false);
        return;
      }
      const draft = JSON.parse(raw) as {
        audienceMode?: AudienceMode;
        recipientId?: string;
        studentId?: string;
        subject?: string;
        body?: string;
      };
      if (draft.audienceMode) this.audienceMode.set(draft.audienceMode);
      if (draft.recipientId) this.recipientId = draft.recipientId;
      if (draft.studentId) this.studentId = draft.studentId;
      if (draft.subject) this.subject = draft.subject;
      if (draft.body) this.body = draft.body;
      if (this.audienceMode() === 'broadcast') {
        this.recipientId = this.allRegisteredParents;
      }
    } catch {
      this.recipientId = this.allRegisteredParents;
    }
    this.loading.set(false);
  }

  private loadRecentSent() {
    this.api.get<SentMessageRow[]>('/academics/messages/sent').subscribe({
      next: (rows) => {
        const seen = new Set<string>();
        const unique: SentMessageRow[] = [];
        for (const row of rows) {
          const key = `${row.subject}|${row.body.slice(0, 80)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(row);
          if (unique.length >= 6) break;
        }
        this.recentSent.set(unique);
      },
      error: () => this.recentSent.set([]),
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
