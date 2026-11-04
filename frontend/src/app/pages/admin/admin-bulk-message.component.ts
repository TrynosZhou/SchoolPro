import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface ClassOption { id: string; name: string; formName: string | null }
interface FormOption { id: string; name: string }

interface AudiencePreview {
  total: number;
  parents: number;
  students: number;
  withEmail: number;
  withPhone: number;
  label: string;
  sample: { name: string; type: string; email?: string; phone?: string }[];
}

interface BulkSummary {
  id: string;
  subject: string;
  audienceLabel: string;
  channels: string[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  senderName: string | null;
  createdAt: string;
}

interface BulkRecipientLog {
  id: string;
  recipientName: string;
  recipientType: string;
  channel: string;
  destination?: string;
  status: string;
  error?: string;
}

interface BulkDetail extends BulkSummary {
  body: string;
  recipients: BulkRecipientLog[];
}

@Component({
  selector: 'app-admin-bulk-message',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './admin-bulk-message.component.html',
  styleUrl: './admin-bulk-message.component.scss',
})
export class AdminBulkMessageComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  classes = signal<ClassOption[]>([]);
  forms = signal<FormOption[]>([]);

  scope: 'all' | 'class' | 'form' = 'class';
  classId = '';
  formId = '';
  audience: 'parents' | 'students' | 'both' = 'parents';
  channelEmail = true;
  channelSms = false;
  subject = '';
  body = '';

  preview = signal<AudiencePreview | null>(null);
  previewing = signal(false);
  sending = signal(false);

  history = signal<BulkSummary[]>([]);
  detail = signal<BulkDetail | null>(null);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  channels = computed(() => {
    const list: string[] = [];
    if (this.channelEmail) list.push('email');
    if (this.channelSms) list.push('sms');
    return list;
  });

  ngOnInit(): void {
    this.api.get<{ classes: ClassOption[]; forms: FormOption[] }>('/communication/bulk/audiences').subscribe({
      next: (res) => {
        this.classes.set(res.classes || []);
        this.forms.set(res.forms || []);
      },
      error: () => {},
    });
    this.loadHistory();
  }

  private buildFilter(): Record<string, unknown> {
    return {
      scope: this.scope,
      audience: this.audience,
      classId: this.scope === 'class' ? this.classId : undefined,
      formId: this.scope === 'form' ? this.formId : undefined,
    };
  }

  private validAudience(): boolean {
    if (this.scope === 'class' && !this.classId) return false;
    if (this.scope === 'form' && !this.formId) return false;
    return true;
  }

  runPreview(): void {
    if (!this.validAudience()) {
      this.showToast('error', 'Select a class or form first.');
      return;
    }
    this.previewing.set(true);
    this.preview.set(null);
    this.api.post<AudiencePreview>('/communication/bulk/preview', this.buildFilter()).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.previewing.set(false);
      },
      error: (e) => {
        this.previewing.set(false);
        this.showToast('error', e?.error?.message || 'Could not preview audience.');
      },
    });
  }

  send(): void {
    if (!this.validAudience()) {
      this.showToast('error', 'Select a class or form first.');
      return;
    }
    if (!this.channels().length) {
      this.showToast('error', 'Choose at least one channel (email or SMS).');
      return;
    }
    if (!this.subject.trim() || !this.body.trim()) {
      this.showToast('error', 'Enter a subject and a message.');
      return;
    }
    this.sending.set(true);
    this.api
      .post<BulkSummary>('/communication/bulk', {
        ...this.buildFilter(),
        channels: this.channels(),
        subject: this.subject.trim(),
        body: this.body.trim(),
      })
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          this.showToast(
            'success',
            `Sent to ${res.sentCount} of ${res.totalRecipients} deliveries (${res.failedCount} failed).`,
          );
          this.subject = '';
          this.body = '';
          this.preview.set(null);
          this.loadHistory();
          this.openDetail(res.id);
        },
        error: (e) => {
          this.sending.set(false);
          this.showToast('error', e?.error?.message || 'Could not send bulk message.');
        },
      });
  }

  loadHistory(): void {
    this.api.get<BulkSummary[]>('/communication/bulk').subscribe({
      next: (rows) => this.history.set(rows),
      error: () => this.history.set([]),
    });
  }

  openDetail(id: string): void {
    this.api.get<BulkDetail>(`/communication/bulk/${id}`).subscribe({
      next: (res) => this.detail.set(res),
      error: () => {},
    });
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
