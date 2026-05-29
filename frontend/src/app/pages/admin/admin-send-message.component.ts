import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

/** Sentinel value for broadcasting to every registered parent account. */
export const ALL_REGISTERED_PARENTS = '__all_registered_parents__';

@Component({
  selector: 'app-admin-send-message',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-send-message.component.html',
  styleUrl: './admin-communication.component.scss',
})
export class AdminSendMessageComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly allRegisteredParents = ALL_REGISTERED_PARENTS;

  recipients = signal<RecipientRow[]>([]);
  registeredParentCount = signal(0);
  students = signal<StudentRow[]>([]);
  sending = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  recipientId = '';
  studentId = '';
  subject = '';
  body = '';

  isAllParentsBroadcast(): boolean {
    return this.recipientId === ALL_REGISTERED_PARENTS;
  }

  ngOnInit() {
    this.api.get<RecipientsResponse | RecipientRow[]>('/academics/messages/recipients').subscribe({
      next: (data) => {
        if (Array.isArray(data)) {
          this.recipients.set(data);
          this.registeredParentCount.set(data.filter((r) => r.role === 'parent').length);
          return;
        }
        this.recipients.set(data.recipients);
        this.registeredParentCount.set(data.registeredParentCount);
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
  }

  recipientLabel(r: RecipientRow): string {
    return `${r.firstName} ${r.lastName} (${r.role}) — ${r.email}`;
  }

  studentLabel(s: StudentRow): string {
    return `${s.firstName} ${s.lastName} (${s.admissionNumber})`;
  }

  send() {
    if (!this.recipientId || !this.subject.trim() || !this.body.trim()) {
      this.showToast('error', 'Recipient, subject, and message are required.');
      return;
    }

    if (this.isAllParentsBroadcast() && this.registeredParentCount() === 0) {
      this.showToast('error', 'No registered parents are available to receive this announcement.');
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
        this.recipientId = '';
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

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
