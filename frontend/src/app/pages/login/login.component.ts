import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';
type SignupRole = 'parent' | 'student';

interface PasswordPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private readonly rememberKey = 'school_pro_remember_username';

  mode = signal<AuthMode>('signin');
  signupRole = signal<SignupRole>('parent');

  username = '';
  signupEmail = '';
  password = '';
  rememberMe = true;
  showPassword = signal(false);
  loading = signal(false);
  error = signal('');
  success = signal('');

  resetToken = '';
  resetConfirmPassword = '';
  devResetUrl = signal('');

  signup = {
    firstName: '',
    lastName: '',
    phone: '',
    confirmPassword: '',
    admissionNumber: '',
    dateOfBirth: '',
    linkAdmissionNumber: '',
    relationship: 'Parent',
  };

  passwordPolicy = signal<PasswordPolicy>({
    minPasswordLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: false,
  });

  readonly features = [
    { icon: '🎓', title: 'Student lifecycle', text: 'Registration, enrollment & report cards' },
    { icon: '📊', title: 'Exams & academics', text: 'Marks entry with auto-save to report cards' },
    { icon: '💳', title: 'Finance & billing', text: 'Invoices, payments, and debt tracking' },
    { icon: '👩‍🏫', title: 'Staff & attendance', text: 'Directory, roles, and daily attendance' },
  ];

  readonly currentYear = new Date().getFullYear();

  passwordRules = computed(() => {
    const p = this.passwordPolicy();
    const rules: string[] = [`At least ${p.minPasswordLength} characters`];
    if (p.requireUppercase) rules.push('One uppercase letter');
    if (p.requireLowercase) rules.push('One lowercase letter');
    if (p.requireNumber) rules.push('One number');
    if (p.requireSpecialChar) rules.push('One special character');
    return rules;
  });

  ngOnInit() {
    const saved = localStorage.getItem(this.rememberKey);
    if (saved) {
      this.username = saved;
      this.rememberMe = true;
    }

    this.api.get<PasswordPolicy>('/auth/password-policy').subscribe({
      next: (policy) => this.passwordPolicy.set(policy),
      error: () => {},
    });

    this.route.queryParamMap.subscribe((params) => {
      const token = params.get('reset')?.trim();
      if (token) {
        this.resetToken = token;
        this.mode.set('reset');
        this.error.set('');
        this.success.set('');
      }
    });
  }

  setMode(next: AuthMode) {
    this.mode.set(next);
    this.error.set('');
    this.success.set('');
    this.devResetUrl.set('');
    if (next !== 'reset') {
      this.resetToken = '';
      this.password = '';
      this.resetConfirmPassword = '';
      void this.router.navigate([], {
        queryParams: { reset: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  setSignupRole(role: SignupRole) {
    this.signupRole.set(role);
    this.error.set('');
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  onSubmit() {
    const m = this.mode();
    if (m === 'signin') {
      this.submitSignIn();
    } else if (m === 'signup') {
      this.submitSignUp();
    } else if (m === 'forgot') {
      this.submitForgotPassword();
    } else {
      this.submitResetPassword();
    }
  }

  submitForgotPassword() {
    if (!this.username.trim()) {
      this.error.set('Enter your username or email address.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.devResetUrl.set('');

    this.auth.forgotPassword(this.username.trim()).subscribe({
      next: (res) => {
        this.success.set(res.message);
        if (res.resetUrl) {
          this.devResetUrl.set(res.resetUrl);
        }
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.message || 'Could not send reset instructions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  submitResetPassword() {
    this.error.set('');
    this.success.set('');

    if (!this.resetToken.trim()) {
      this.error.set('This reset link is invalid. Request a new password reset.');
      return;
    }
    if (!this.password) {
      this.error.set('Enter a new password.');
      return;
    }
    if (this.password !== this.resetConfirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);

    this.auth.resetPassword(this.resetToken.trim(), this.password).subscribe({
      next: (res) => {
        this.success.set(res.message);
        this.password = '';
        this.resetConfirmPassword = '';
        this.resetToken = '';
        this.loading.set(false);
        setTimeout(() => this.setMode('signin'), 2000);
      },
      error: (e) => {
        this.error.set(e.error?.message || 'Could not reset password. The link may have expired.');
        this.loading.set(false);
      },
    });
  }

  private submitSignIn() {
    if (!this.username.trim() || !this.password) {
      this.error.set('Enter your username and password.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    if (this.rememberMe) {
      localStorage.setItem(this.rememberKey, this.username.trim());
    } else {
      localStorage.removeItem(this.rememberKey);
    }

    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => this.router.navigate([this.auth.getPortalRoute()]),
      error: (e) => {
        this.error.set(e.error?.message || 'Invalid username or password. Please try again.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  private submitSignUp() {
    this.error.set('');
    this.success.set('');

    if (!this.signup.firstName.trim() || !this.signup.lastName.trim()) {
      this.error.set('Enter your first and last name.');
      return;
    }
    if (!this.signupEmail.trim()) {
      this.error.set('Enter your email address.');
      return;
    }
    if (!this.password) {
      this.error.set('Choose a password.');
      return;
    }
    if (this.password !== this.signup.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (this.signupRole() === 'student' && !this.signup.admissionNumber.trim()) {
      this.error.set('Enter your student ID (admission number).');
      return;
    }

    this.loading.set(true);

    this.auth.register({
      email: this.signupEmail.trim(),
      password: this.password,
      firstName: this.signup.firstName.trim(),
      lastName: this.signup.lastName.trim(),
      role: this.signupRole(),
      phone: this.signup.phone.trim() || undefined,
      admissionNumber: this.signupRole() === 'student' ? this.signup.admissionNumber.trim().toUpperCase() : undefined,
      dateOfBirth: this.signupRole() === 'student' && this.signup.dateOfBirth ? this.signup.dateOfBirth : undefined,
      linkAdmissionNumber:
        this.signupRole() === 'parent' && this.signup.linkAdmissionNumber.trim()
          ? this.signup.linkAdmissionNumber.trim().toUpperCase()
          : undefined,
      relationship: this.signupRole() === 'parent' ? this.signup.relationship.trim() || 'Parent' : undefined,
    }).subscribe({
      next: () => this.router.navigate([this.auth.getPortalRoute()]),
      error: (e) => {
        this.error.set(e.error?.message || 'Could not create account. Please try again.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
