import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { MessageBadgeService } from '../../core/services/message-badge.service';
import { formatStudentClassLabel } from '../../core/utils/class-display';

interface StaffRecipient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface ParentChildOption {
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    className?: string;
  };
}

interface SentMessageResponse {
  id: string;
  subject: string;
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DRAFT_KEY = 'school_pro_parent_email_draft';

@Component({
  selector: 'app-parent-send-email',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './parent-send-email.component.html',
  styleUrl: './parent-send-email.component.scss',
})
export class ParentSendEmailComponent implements OnInit {
  private api = inject(ApiService);
  private messageBadge = inject(MessageBadgeService);
  private route = inject(ActivatedRoute);

  readonly nav = PARENT_NAV_ITEMS;
  readonly maxFiles = MAX_FILES;

  children = signal<ParentChildOption[]>([]);
  staffRecipients = signal<StaffRecipient[]>([]);
  loading = signal(true);
  sending = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  recipientEmail = '';
  subject = '';
  body = '';
  studentId = '';
  selectedFiles = signal<File[]>([]);
  private isReplyMode = false;

  ngOnInit() {
    const reply = this.route.snapshot.queryParamMap;
    const replyEmail = (reply.get('recipientEmail') || '').trim();
    const replySubject = reply.get('subject') || '';
    const replyStudentId = reply.get('studentId') || '';
    this.isReplyMode = Boolean(replyEmail || replySubject);
    if (replyEmail) this.recipientEmail = replyEmail;
    if (replySubject) this.subject = replySubject;
    if (replyStudentId) this.studentId = replyStudentId;
    if (!this.isReplyMode) this.restoreDraft();

    this.api.get<StaffRecipient[]>('/academics/messages/staff-recipients').subscribe({
      next: (rows) => {
        this.staffRecipients.set(rows);
        const defaultAdmin =
          rows.find((r) => r.role === 'admin') ||
          rows.find((r) => r.role === 'director') ||
          rows.find((r) => r.role === 'principal') ||
          rows[0];
        if (defaultAdmin && !this.recipientEmail) {
          this.recipientEmail = defaultAdmin.email;
        }
      },
      error: () => this.staffRecipients.set([]),
    });

    this.api.get<ParentChildOption[]>('/dashboard/parent').subscribe({
      next: (rows) => {
        this.children.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.children.set([]);
        this.loading.set(false);
      },
    });
  }

  childLabel(row: ParentChildOption): string {
    const s = row.student;
    const cls = formatStudentClassLabel(s.className);
    const id = s.admissionNumber ? ` · ${s.admissionNumber}` : '';
    return `${s.firstName} ${s.lastName}${id} · ${cls}`;
  }

  isReply(): boolean {
    return this.isReplyMode;
  }

  bodyCharCount(): number {
    return this.body.length;
  }

  subjectCharCount(): number {
    return this.subject.trim().length;
  }

  canSend(): boolean {
    const to = this.recipientEmail.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
    return Boolean(this.subject.trim() && this.body.trim());
  }

  selectRecipient(email: string) {
    this.recipientEmail = email;
    this.saveDraft();
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      admin: 'Admin',
      director: 'Director',
      principal: 'Principal',
      teacher: 'Teacher',
    };
    return map[role] || role;
  }

  roleIcon(role: string): string {
    const map: Record<string, string> = {
      admin: '⚙️',
      director: '🎯',
      principal: '🏛️',
      teacher: '👩‍🏫',
    };
    return map[role] || '👤';
  }

  fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return '📄';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx'].includes(ext)) return '📊';
    return '📎';
  }

  clearForm() {
    this.recipientEmail = '';
    this.subject = '';
    this.body = '';
    this.studentId = '';
    this.selectedFiles.set([]);
    this.isReplyMode = false;
    localStorage.removeItem(DRAFT_KEY);
    const defaultAdmin =
      this.staffRecipients().find((r) => r.role === 'admin') ||
      this.staffRecipients().find((r) => r.role === 'director') ||
      this.staffRecipients().find((r) => r.role === 'principal') ||
      this.staffRecipients()[0];
    if (defaultAdmin) this.recipientEmail = defaultAdmin.email;
    this.showToast('success', 'Composer cleared.');
  }

  saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          recipientEmail: this.recipientEmail,
          subject: this.subject,
          body: this.body,
          studentId: this.studentId,
        }),
      );
    } catch {
      /* ignore storage errors */
    }
  }

  private restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        recipientEmail?: string;
        subject?: string;
        body?: string;
        studentId?: string;
      };
      if (draft.recipientEmail) this.recipientEmail = draft.recipientEmail;
      if (draft.subject) this.subject = draft.subject;
      if (draft.body) this.body = draft.body;
      if (draft.studentId) this.studentId = draft.studentId;
    } catch {
      /* ignore */
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files || []);
    if (!picked.length) return;

    const current = [...this.selectedFiles()];
    for (const file of picked) {
      if (current.length >= MAX_FILES) {
        this.showToast('error', `You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        this.showToast('error', `${file.name} is too large (max 5 MB per file).`);
        continue;
      }
      current.push(file);
    }
    this.selectedFiles.set(current);
    input.value = '';
    this.saveDraft();
  }

  removeFile(index: number) {
    const next = [...this.selectedFiles()];
    next.splice(index, 1);
    this.selectedFiles.set(next);
    this.saveDraft();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  send() {
    const trimmedTo = this.recipientEmail.trim();
    const trimmedSubject = this.subject.trim();
    const trimmedBody = this.body.trim();
    if (!trimmedTo) {
      this.showToast('error', 'Enter the recipient email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTo)) {
      this.showToast('error', 'Enter a valid email address.');
      return;
    }
    if (!trimmedSubject || !trimmedBody) {
      this.showToast('error', 'Enter a subject and message.');
      return;
    }

    const form = new FormData();
    form.append('recipientEmail', trimmedTo);
    form.append('subject', trimmedSubject);
    form.append('body', trimmedBody);
    if (this.studentId) form.append('studentId', this.studentId);
    for (const file of this.selectedFiles()) {
      form.append('attachments', file);
    }

    this.sending.set(true);
    this.api.postFormData<SentMessageResponse>('/academics/messages/to-admin', form).subscribe({
      next: () => {
        this.sending.set(false);
        this.subject = '';
        this.body = '';
        this.studentId = '';
        this.selectedFiles.set([]);
        this.isReplyMode = false;
        localStorage.removeItem(DRAFT_KEY);
        this.messageBadge.refresh();
        this.showToast('success', `Your message was sent to ${trimmedTo}.`);
      },
      error: (e) => {
        this.sending.set(false);
        this.showToast('error', e.error?.message || 'Could not send message. Try again.');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
