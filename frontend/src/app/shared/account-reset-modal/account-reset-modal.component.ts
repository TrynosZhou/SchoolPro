import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import {
  passwordRuleChecks,
  validatePasswordAgainstPolicy,
  type PasswordPolicy,
} from '../../core/utils/password-policy.util';

interface AccountInfo {
  id: string;
  username: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  roleLabel: string;
}

interface ResetAccountResponse {
  message: string;
  username: string | null;
  changed: string[];
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

/**
 * Modal that lets an administrator reset a user's account: change the username only,
 * the password only, or both. Open it with `@if (...) { <app-account-reset-modal ... /> }`.
 */
@Component({
  selector: 'app-account-reset-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account-reset-modal.component.html',
  styleUrl: './account-reset-modal.component.scss',
})
export class AccountResetModalComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The portal user account id (users.id). */
  @Input({ required: true }) userId!: string;
  /** Optional name shown in the header while the account details load. */
  @Input() displayName = '';

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ message: string; username: string | null }>();

  loading = signal(true);
  submitting = signal(false);
  error = signal('');
  account = signal<AccountInfo | null>(null);
  policy = signal<PasswordPolicy | null>(null);
  copied = signal(false);

  username = '';
  password = '';
  confirmPassword = '';
  showPassword = false;

  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.api.get<PasswordPolicy>('/auth/password-policy').subscribe({
      next: (p) => this.policy.set(p),
      error: () => undefined,
    });
    this.api.get<AccountInfo>(`/admin/users/${this.userId}`).subscribe({
      next: (a) => {
        this.account.set(a);
        this.username = a.username ?? '';
        this.loading.set(false);
        this.focusFirstField();
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error?.message || 'Could not load this account');
      },
    });
  }

  ngAfterViewInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  // ---- display helpers -------------------------------------------------

  get isStudent(): boolean {
    return this.account()?.role === 'student';
  }

  get title(): string {
    const a = this.account();
    return a ? `${a.firstName} ${a.lastName}` : this.displayName;
  }

  get initials(): string {
    const parts = this.title.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  get usernameChanged(): boolean {
    const current = this.account()?.username ?? '';
    return !this.isStudent && this.username.trim() !== '' && this.username.trim() !== current;
  }

  get passwordEntered(): boolean {
    return this.password.trim() !== '' || this.confirmPassword.trim() !== '';
  }

  get usernameInvalid(): boolean {
    return this.usernameChanged && !USERNAME_PATTERN.test(this.username.trim());
  }

  get ruleChecks(): { label: string; met: boolean }[] {
    return passwordRuleChecks(this.password, this.policy());
  }

  /** 0 = nothing typed, 1 = weak … 4 = strong. */
  get strength(): number {
    const pwd = this.password;
    if (!pwd) return 0;
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pwd)).length;
    let score = variety;
    if (pwd.length >= 12) score += 1;
    if (pwd.length < 8) score = Math.min(score, 1);
    const policyMet = this.ruleChecks.every((c) => c.met);
    if (!policyMet) score = Math.min(score, 2);
    return Math.max(1, Math.min(4, score > 4 ? 4 : score));
  }

  get strengthLabel(): string {
    return ['', 'Weak', 'Fair', 'Good', 'Strong'][this.strength];
  }

  get passwordsMatch(): boolean {
    return this.confirmPassword.length > 0 && this.password === this.confirmPassword;
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  get pendingSummary(): string {
    const parts: string[] = [];
    if (this.usernameChanged) parts.push('username');
    if (this.passwordEntered) parts.push('password');
    return parts.length ? `Will update: ${parts.join(' and ')}` : 'No changes yet';
  }

  get canSave(): boolean {
    return !this.loading() && !this.submitting() && !!this.account() && (this.usernameChanged || this.passwordEntered);
  }

  // ---- actions ---------------------------------------------------------

  close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  generatePassword(): void {
    const policy = this.policy();
    const length = Math.max(14, (policy?.minPasswordLength ?? 8) + 4);
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%^&*?-_';
    const all = lower + upper + digits + symbols;

    const pick = (set: string) => set.charAt(this.randomInt(set.length));
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = this.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    this.password = chars.join('');
    this.confirmPassword = this.password;
    this.showPassword = true;
    this.error.set('');
  }

  async copyPassword(): Promise<void> {
    if (!this.password) return;
    try {
      await navigator.clipboard.writeText(this.password);
      this.copied.set(true);
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.error.set('Could not copy to the clipboard. Select the password and copy it manually.');
    }
  }

  save(): void {
    if (!this.canSave) return;

    if (this.usernameInvalid) {
      this.error.set('Username must be 3–50 characters: letters, numbers, dots, underscores or hyphens only');
      return;
    }

    if (this.passwordEntered) {
      if (this.password !== this.confirmPassword) {
        this.error.set('Passwords do not match');
        return;
      }
      const pwdErr = validatePasswordAgainstPolicy(this.password, this.policy());
      if (pwdErr) {
        this.error.set(pwdErr);
        return;
      }
    }

    const body: Record<string, string> = {};
    if (this.usernameChanged) body['username'] = this.username.trim();
    if (this.passwordEntered) body['password'] = this.password;

    this.error.set('');
    this.submitting.set(true);
    this.api.post<ResetAccountResponse>(`/admin/users/${this.userId}/reset-account`, body).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.saved.emit({ message: res.message, username: res.username });
        this.closed.emit();
      },
      error: (e) => {
        this.submitting.set(false);
        this.error.set(e?.error?.message || 'Could not reset the account');
      },
    });
  }

  // ---- internals -------------------------------------------------------

  private randomInt(max: number): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  private focusFirstField(): void {
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector<HTMLInputElement>('input:not([disabled])');
      el?.focus();
    }, 60);
  }
}
