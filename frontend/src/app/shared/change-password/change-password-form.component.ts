import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  passwordPolicyRules,
  passwordRuleChecks,
  validatePasswordAgainstPolicy,
  type PasswordPolicy,
} from '../../core/utils/password-policy.util';

@Component({
  selector: 'app-change-password-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './change-password-form.component.html',
  styleUrl: './change-password-form.component.scss',
})
export class ChangePasswordFormComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  passwordPolicy = signal<PasswordPolicy | null>(null);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);

  readonly newPasswordChecks = computed(() =>
    passwordRuleChecks(this.newPassword, this.passwordPolicy()),
  );

  readonly isStudent = computed(() => this.auth.user()?.role === 'student');

  ngOnInit(): void {
    this.api.get<PasswordPolicy>('/auth/password-policy').subscribe({
      next: (policy) => this.passwordPolicy.set(policy),
      error: () => this.passwordPolicy.set(null),
    });
  }

  policyHint(): string {
    return passwordPolicyRules(this.passwordPolicy()).join(', ');
  }

  toggleCurrentPassword(): void {
    this.showCurrentPassword.update((v) => !v);
  }

  toggleNewPassword(): void {
    this.showNewPassword.update((v) => !v);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  submit(): void {
    if (!this.currentPassword.trim()) {
      this.showToast('error', 'Enter your current password.');
      return;
    }
    if (!this.newPassword) {
      this.showToast('error', 'Enter a new password.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.showToast('error', 'New password and confirmation do not match.');
      return;
    }
    const policyError = validatePasswordAgainstPolicy(this.newPassword, this.passwordPolicy());
    if (policyError) {
      this.showToast('error', policyError);
      return;
    }
    if (this.newPassword === this.currentPassword) {
      this.showToast('error', 'New password must be different from your current password.');
      return;
    }

    this.submitting.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.showCurrentPassword.set(false);
        this.showNewPassword.set(false);
        this.showConfirmPassword.set(false);
        this.showToast('success', res.message || (this.isStudent()
          ? 'Password changed successfully. Next time, sign in with your Student ID and new password.'
          : 'Password changed successfully.'));
      },
      error: (e) => {
        this.submitting.set(false);
        const msg = e.error?.message || e.message || 'Could not change password.';
        this.showToast('error', msg);
      },
    });
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
