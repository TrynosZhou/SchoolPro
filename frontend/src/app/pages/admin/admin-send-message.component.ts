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

  recipients = signal<RecipientRow[]>([]);
  students = signal<StudentRow[]>([]);
  sending = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  recipientId = '';
  studentId = '';
  subject = '';
  body = '';

  ngOnInit() {
    this.api.get<RecipientRow[]>('/academics/messages/recipients').subscribe({
      next: (rows) => this.recipients.set(rows),
      error: () => this.recipients.set([]),
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
    this.sending.set(true);
    this.api
      .post('/academics/messages', {
        recipientId: this.recipientId,
        studentId: this.studentId || undefined,
        subject: this.subject.trim(),
        body: this.body.trim(),
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.subject = '';
          this.body = '';
          this.studentId = '';
          this.showToast('success', 'Message sent successfully.');
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
