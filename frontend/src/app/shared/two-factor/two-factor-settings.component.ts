import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, TwoFactorEnrollment, TwoFactorStatus } from '../../core/services/auth.service';

type Stage = 'loading' | 'unavailable' | 'off' | 'enrolling' | 'backupCodes' | 'on' | 'disabling';

@Component({
  selector: 'app-two-factor-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    @switch (stage()) {
      @case ('loading') {
        <p class="tf-note">Checking two-factor status…</p>
      }
      @case ('unavailable') {
        <p class="tf-note">Two-factor authentication applies to director, principal, admin and accountant accounts.</p>
      }
      @case ('off') {
        <p class="tf-note">
          Two-factor authentication is <strong>off</strong>. Add a second step at sign-in using an
          authenticator app (Google Authenticator, Authy, Microsoft Authenticator).
        </p>
        <button type="button" class="tf-btn tf-btn--primary" [disabled]="busy()" (click)="startEnrollment()">
          {{ busy() ? 'Preparing…' : 'Turn on two-factor authentication' }}
        </button>
      }
      @case ('enrolling') {
        @if (enrollment(); as e) {
          <p class="tf-note">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
          <div class="tf-qr">
            <img [src]="e.qrDataUrl" alt="Two-factor authentication QR code" />
          </div>
          <p class="tf-secret">Or enter this key manually: <code>{{ e.secret }}</code></p>
          <label class="tf-field">
            <span>6-digit code</span>
            <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [(ngModel)]="code" placeholder="123456" />
          </label>
          <div class="tf-actions">
            <button type="button" class="tf-btn tf-btn--primary" [disabled]="busy()" (click)="enable()">
              {{ busy() ? 'Verifying…' : 'Verify and turn on' }}
            </button>
            <button type="button" class="tf-btn" [disabled]="busy()" (click)="reset()">Cancel</button>
          </div>
        }
      }
      @case ('backupCodes') {
        <p class="tf-note">
          Two-factor authentication is on. Save these backup codes somewhere safe — each one works
          once if you lose access to your authenticator app. They will not be shown again.
        </p>
        <ul class="tf-codes">
          @for (c of backupCodes(); track c) { <li>{{ c }}</li> }
        </ul>
        <div class="tf-actions">
          <button type="button" class="tf-btn tf-btn--primary" (click)="copyCodes()">
            {{ copied() ? 'Copied' : 'Copy codes' }}
          </button>
          <button type="button" class="tf-btn" (click)="finish()">Done</button>
        </div>
      }
      @case ('on') {
        <p class="tf-note">
          Two-factor authentication is <strong>on</strong>.
          @if (status(); as s) {
            {{ s.backupCodesRemaining }} backup code{{ s.backupCodesRemaining === 1 ? '' : 's' }} remaining.
          }
        </p>
        <label class="tf-field">
          <span>Authenticator code</span>
          <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [(ngModel)]="code" placeholder="123456" />
        </label>
        <div class="tf-actions">
          <button type="button" class="tf-btn" [disabled]="busy()" (click)="regenerate()">
            {{ busy() ? 'Working…' : 'New backup codes' }}
          </button>
          <button type="button" class="tf-btn tf-btn--danger" [disabled]="busy()" (click)="stage.set('disabling')">
            Turn off
          </button>
        </div>
      }
      @case ('disabling') {
        <p class="tf-note">Confirm your password to turn off two-factor authentication.</p>
        <label class="tf-field">
          <span>Password</span>
          <input type="password" autocomplete="current-password" [(ngModel)]="password" />
        </label>
        @if (status()?.backupCodesRemaining) {
          <label class="tf-field">
            <span>Authenticator or backup code</span>
            <input type="text" autocomplete="one-time-code" [(ngModel)]="code" placeholder="123456 or ABCD-EFGH" />
          </label>
        }
        <div class="tf-actions">
          <button type="button" class="tf-btn tf-btn--danger" [disabled]="busy()" (click)="disable()">
            {{ busy() ? 'Turning off…' : 'Turn off two-factor authentication' }}
          </button>
          <button type="button" class="tf-btn" [disabled]="busy()" (click)="reset()">Cancel</button>
        </div>
      }
    }

    @if (message(); as msg) {
      <p class="tf-message" [class.is-error]="!!error()">{{ msg }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --ink: var(--color-text-primary, #18181b);
        --ink-2: var(--color-text-secondary, #52525b);
        --rule: var(--color-border, #e4e4e7);
        --rule-strong: var(--color-border-strong, #d4d4d8);
        --brass: #b8924a;
        --navy: #0f1d36;
        --danger: #8a1c13;
      }
      .tf-note {
        margin: 0 0 1rem;
        font-size: 0.9rem;
        line-height: 1.6;
        color: var(--ink-2);
      }
      .tf-qr {
        display: flex;
        justify-content: center;
        margin-bottom: 0.75rem;
        padding: 0.75rem;
        background: #fff;
        border: 1px solid var(--rule);
        border-radius: 4px;

        img { width: 200px; height: 200px; }
      }
      .tf-secret {
        margin: 0 0 1rem;
        font-size: 0.82rem;
        color: var(--ink-2);
        overflow-wrap: anywhere;

        code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.82rem;
          letter-spacing: 0.06em;
          color: var(--ink);
        }
      }
      .tf-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 0.9rem;

        span {
          font-size: 0.76rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--ink-2);
        }

        input {
          width: 100%;
          min-height: 40px;
          padding: 0.45rem 0.7rem;
          border: 1px solid var(--rule-strong);
          border-radius: 3px;
          background: var(--color-bg, #fff);
          color: var(--ink);
          font-family: inherit;
          font-size: 0.9rem;
          box-sizing: border-box;

          &:focus {
            outline: none;
            border-color: var(--brass);
            box-shadow: 0 0 0 3px rgba(184, 146, 74, 0.3);
          }
        }
      }
      .tf-codes {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.4rem;
        margin: 0 0 1rem;
        padding: 0.9rem;
        list-style: none;
        background: #fbf9f4;
        border: 1px solid var(--rule);
        border-radius: 4px;

        li {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9rem;
          letter-spacing: 0.08em;
          color: var(--navy);
        }
      }
      .tf-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }
      .tf-btn {
        min-height: 38px;
        padding: 0.45rem 1rem;
        border: 1px solid var(--rule-strong);
        border-radius: 3px;
        background: transparent;
        color: var(--ink);
        font-family: inherit;
        font-size: 0.84rem;
        font-weight: 600;
        cursor: pointer;

        &:disabled { opacity: 0.55; cursor: not-allowed; }

        &--primary {
          background: var(--navy);
          border-color: var(--navy);
          color: #fff;
        }

        &--danger {
          border-color: var(--danger);
          color: var(--danger);
        }
      }
      .tf-message {
        margin: 0.9rem 0 0;
        font-size: 0.85rem;
        color: #1f7a4d;

        &.is-error { color: var(--danger); }
      }
      @media (max-width: 640px) {
        .tf-codes { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class TwoFactorSettingsComponent implements OnInit {
  private auth = inject(AuthService);

  stage = signal<Stage>('loading');
  status = signal<TwoFactorStatus | null>(null);
  enrollment = signal<TwoFactorEnrollment | null>(null);
  backupCodes = signal<string[]>([]);
  busy = signal(false);
  copied = signal(false);
  message = signal('');
  error = signal('');

  code = '';
  password = '';

  ngOnInit() {
    this.loadStatus();
  }

  private loadStatus() {
    this.auth.twoFactorStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.stage.set(!status.available ? 'unavailable' : status.enabled ? 'on' : 'off');
      },
      error: () => this.stage.set('unavailable'),
    });
  }

  startEnrollment() {
    this.busy.set(true);
    this.clearMessages();
    this.auth.setupTwoFactor().subscribe({
      next: (enrollment) => {
        this.enrollment.set(enrollment);
        this.code = '';
        this.stage.set('enrolling');
        this.busy.set(false);
      },
      error: (e) => {
        this.fail(e, 'Could not start two-factor setup');
      },
    });
  }

  enable() {
    if (!this.code.trim()) {
      this.setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.auth.enableTwoFactor(this.code.trim()).subscribe({
      next: (res) => {
        this.backupCodes.set(res.backupCodes);
        this.enrollment.set(null);
        this.code = '';
        this.busy.set(false);
        this.stage.set('backupCodes');
        this.loadStatus();
      },
      error: (e) => this.fail(e, 'Could not turn on two-factor authentication'),
    });
  }

  regenerate() {
    if (!this.code.trim()) {
      this.setError('Enter a code from your authenticator app.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.auth.regenerateBackupCodes(this.code.trim()).subscribe({
      next: (res) => {
        this.backupCodes.set(res.backupCodes);
        this.code = '';
        this.busy.set(false);
        this.stage.set('backupCodes');
        this.setMessage('New backup codes generated. Your previous codes no longer work.');
      },
      error: (e) => this.fail(e, 'Could not generate new backup codes'),
    });
  }

  disable() {
    if (!this.password) {
      this.setError('Enter your password to turn off two-factor authentication.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    const useBackup = this.code.includes('-');
    this.auth
      .disableTwoFactor({
        password: this.password,
        code: this.code.trim() && !useBackup ? this.code.trim() : undefined,
        backupCode: useBackup ? this.code.trim() : undefined,
      })
      .subscribe({
        next: () => {
          this.password = '';
          this.code = '';
          this.busy.set(false);
          this.stage.set('off');
          this.setMessage('Two-factor authentication is off.');
          this.loadStatus();
        },
        error: (e) => this.fail(e, 'Could not turn off two-factor authentication'),
      });
  }

  reset() {
    this.password = '';
    this.code = '';
    this.clearMessages();
    this.stage.set(this.status()?.enabled ? 'on' : 'off');
  }

  finish() {
    this.backupCodes.set([]);
    this.clearMessages();
    this.stage.set('on');
  }

  copyCodes() {
    const text = this.backupCodes().join('\n');
    void navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 3000);
    });
  }

  private fail(e: unknown, fallback: string) {
    this.busy.set(false);
    this.setError((e as { error?: { message?: string } })?.error?.message || fallback);
  }

  private setError(msg: string) {
    this.error.set(msg);
    this.message.set(msg);
  }

  private setMessage(msg: string) {
    this.error.set('');
    this.message.set(msg);
  }

  private clearMessages() {
    this.error.set('');
    this.message.set('');
  }
}
