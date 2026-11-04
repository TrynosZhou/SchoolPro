import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UnlessDemoDirective } from '../../core/directives/unless-demo.directive';

const SECRET_MASK = '********';

type IntegrationId = 'whatsapp' | 'email' | 'webhook' | 'payment' | 'customApi';
type IntegrationStatus = 'active' | 'configured' | 'disabled';

interface WhatsAppIntegration {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  from: string;
  hasAuthToken?: boolean;
}

interface EmailIntegration {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  hasPassword?: boolean;
}

interface WebhookIntegration {
  enabled: boolean;
  url: string;
  secret: string;
  events: string[];
  hasSecret?: boolean;
}

interface PaymentIntegration {
  enabled: boolean;
  provider: 'paynow' | 'stripe' | 'paypal' | 'custom';
  merchantId: string;
  apiKey: string;
  webhookUrl: string;
  hasApiKey?: boolean;
}

interface CustomApiIntegration {
  enabled: boolean;
  name: string;
  baseUrl: string;
  authType: 'none' | 'bearer' | 'api-key' | 'basic';
  apiKeyHeader: string;
  apiKey: string;
  username: string;
  password: string;
  timeoutMs: number;
  hasApiKey?: boolean;
  hasPassword?: boolean;
}

interface IntegrationsPayload {
  whatsapp: WhatsAppIntegration;
  email: EmailIntegration;
  webhook: WebhookIntegration;
  payment: PaymentIntegration;
  customApi: CustomApiIntegration;
}

interface WebhookEventOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-admin-integrations',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, UnlessDemoDirective],
  templateUrl: './admin-integrations.component.html',
  styleUrl: './admin-integrations.component.scss',
})
export class AdminIntegrationsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly secretMask = SECRET_MASK;

  readonly providers: {
    id: IntegrationId;
    label: string;
    icon: string;
    desc: string;
  }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: '📱', desc: 'Twilio parent messaging' },
    { id: 'email', label: 'Email (SMTP)', icon: '✉', desc: 'Transactional email delivery' },
    { id: 'webhook', label: 'Webhooks', icon: '🔗', desc: 'Push events to external systems' },
    { id: 'payment', label: 'Payments', icon: '💳', desc: 'Online fee collection gateways' },
    { id: 'customApi', label: 'Custom API', icon: '🌐', desc: 'Connect third-party REST APIs' },
  ];

  readonly webhookEvents: WebhookEventOption[] = [
    { id: 'student.enrolled', label: 'Student enrolled' },
    { id: 'payment.received', label: 'Payment received' },
    { id: 'invoice.created', label: 'Invoice created' },
    { id: 'attendance.marked', label: 'Attendance marked' },
    { id: 'report_card.published', label: 'Report card published' },
  ];

  activeProvider = signal<IntegrationId>('whatsapp');
  loading = signal(true);
  submitting = signal(false);
  testing = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  status = signal<Record<string, IntegrationStatus>>({});
  envFallback = signal({ whatsapp: false });

  form: IntegrationsPayload = this.defaultForm();

  testWhatsApp = { phone: '', message: '' };
  testEmail = { to: '' };

  activeCount = computed(() =>
    Object.values(this.status()).filter((s) => s === 'active').length
  );

  activeProviderMeta = computed(() =>
    this.providers.find((p) => p.id === this.activeProvider()) ?? this.providers[0]
  );

  get activeEnabled(): boolean {
    return this.form[this.activeProvider()].enabled;
  }

  set activeEnabled(value: boolean) {
    this.form[this.activeProvider()].enabled = value;
  }

  ngOnInit() {
    this.load();
  }

  private defaultForm(): IntegrationsPayload {
    return {
      whatsapp: { enabled: false, accountSid: '', authToken: '', from: '' },
      email: {
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'School Pro',
      },
      webhook: { enabled: false, url: '', secret: '', events: ['student.enrolled', 'payment.received'] },
      payment: { enabled: false, provider: 'paynow', merchantId: '', apiKey: '', webhookUrl: '' },
      customApi: {
        enabled: false,
        name: '',
        baseUrl: '',
        authType: 'bearer',
        apiKeyHeader: 'X-API-Key',
        apiKey: '',
        username: '',
        password: '',
        timeoutMs: 15000,
      },
    };
  }

  load() {
    this.loading.set(true);
    this.api.get<{
      integrations: IntegrationsPayload;
      status: Record<string, IntegrationStatus>;
      envFallback: { whatsapp: boolean };
    }>('/admin/integrations').subscribe({
      next: (data) => {
        this.form = { ...data.integrations };
        this.status.set(data.status);
        this.envFallback.set(data.envFallback);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load integrations');
      },
    });
  }

  setProvider(id: IntegrationId) {
    this.activeProvider.set(id);
  }

  statusLabel(id: string): string {
    const s = this.status()[id];
    if (s === 'active') return 'Connected';
    if (s === 'configured') return 'Incomplete';
    return 'Disabled';
  }

  statusClass(id: string): string {
    return this.status()[id] || 'disabled';
  }

  toggleWebhookEvent(eventId: string) {
    const events = this.form.webhook.events;
    if (events.includes(eventId)) {
      this.form.webhook.events = events.filter((e) => e !== eventId);
    } else {
      this.form.webhook.events = [...events, eventId];
    }
  }

  webhookEventChecked(eventId: string): boolean {
    return this.form.webhook.events.includes(eventId);
  }

  saveCurrent() {
    if (this.auth.isDemoSession()) {
      this.showToast('error', "This action isn't available in demo mode.");
      return;
    }
    this.submitting.set(true);
    const section = this.activeProvider();
    this.api.patch<{ integrations: IntegrationsPayload; status: Record<string, IntegrationStatus> }>(
      '/admin/integrations',
      { [section]: this.form[section] },
    ).subscribe({
      next: (res) => {
        this.form = { ...this.form, ...res.integrations };
        this.status.set(res.status);
        this.submitting.set(false);
        this.showToast('success', `${this.activeProviderMeta().label} settings saved`);
      },
      error: (e) => {
        this.submitting.set(false);
        this.showToast('error', e.error?.message || 'Failed to save integration');
      },
    });
  }

  testIntegration() {
    const provider = this.activeProvider();
    const routeMap: Record<IntegrationId, string> = {
      whatsapp: 'whatsapp',
      email: 'email',
      webhook: 'webhook',
      payment: 'payment',
      customApi: 'custom-api',
    };

    this.testing.set(true);
    const body: { phone?: string; message?: string; email?: string } = {};
    if (provider === 'whatsapp') {
      if (!this.testWhatsApp.phone) {
        this.testing.set(false);
        this.showToast('error', 'Enter a phone number for the test');
        return;
      }
      body.phone = this.testWhatsApp.phone;
      body.message = this.testWhatsApp.message;
    }
    if (provider === 'email' && this.testEmail.to) {
      body.email = this.testEmail.to;
    }

    this.api.post<{ ok: boolean; message: string }>(
      `/admin/integrations/test/${routeMap[provider]}`,
      body,
    ).subscribe({
      next: (res) => {
        this.testing.set(false);
        this.showToast('success', res.message || 'Test succeeded');
      },
      error: (e) => {
        this.testing.set(false);
        this.showToast('error', e.error?.message || 'Integration test failed');
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
