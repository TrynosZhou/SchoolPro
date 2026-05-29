import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

type AuthMode = 'signin' | 'signup';
type SignupRole = 'parent' | 'student';

interface DemoAccount {
  email: string;
  role: string;
  icon: string;
  desc: string;
}

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

  private readonly rememberKey = 'school_pro_remember_email';

  mode = signal<AuthMode>('signin');
  signupRole = signal<SignupRole>('parent');

  email = '';
  password = '';
  rememberMe = true;
  showPassword = signal(false);
  loading = signal(false);
  error = signal('');
  success = signal('');

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

  readonly demoAccounts: DemoAccount[] = [
    { email: 'admin@schoolpro.ac.zw', role: 'Administrator', icon: '⚙️', desc: 'Full school management' },
    { email: 'teacher@schoolpro.ac.zw', role: 'Teacher', icon: '📝', desc: 'Marks & class tools' },
    { email: 'principal@schoolpro.ac.zw', role: 'Principal', icon: '🏫', desc: 'Oversight & academics' },
    { email: 'director@schoolpro.ac.zw', role: 'Director', icon: '📈', desc: 'Executive dashboard' },
    { email: 'parent@schoolpro.ac.zw', role: 'Parent', icon: '👨‍👩‍👧', desc: 'Child progress & fees' },
  ];

  readonly demoPassword = 'Password123!';
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
      this.email = saved;
      this.rememberMe = true;
    } else {
      this.email = 'admin@schoolpro.ac.zw';
    }
    this.password = this.demoPassword;

    this.api.get<PasswordPolicy>('/auth/password-policy').subscribe({
      next: (policy) => this.passwordPolicy.set(policy),
      error: () => {},
    });
  }

  setMode(next: AuthMode) {
    this.mode.set(next);
    this.error.set('');
    this.success.set('');
  }

  setSignupRole(role: SignupRole) {
    this.signupRole.set(role);
    this.error.set('');
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  fillDemo(account: DemoAccount) {
    this.setMode('signin');
    this.email = account.email;
    this.password = this.demoPassword;
    this.error.set('');
  }

  onSubmit() {
    if (this.mode() === 'signin') {
      this.submitSignIn();
    } else {
      this.submitSignUp();
    }
  }

  private submitSignIn() {
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    if (this.rememberMe) {
      localStorage.setItem(this.rememberKey, this.email.trim());
    } else {
      localStorage.removeItem(this.rememberKey);
    }

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => this.router.navigate([this.auth.getPortalRoute()]),
      error: (e) => {
        this.error.set(e.error?.message || 'Invalid email or password. Please try again.');
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
    if (!this.email.trim()) {
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
      email: this.email.trim(),
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
