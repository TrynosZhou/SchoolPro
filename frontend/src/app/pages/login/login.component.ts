import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface DemoAccount {
  email: string;
  role: string;
  icon: string;
  desc: string;
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
  private router = inject(Router);

  private readonly rememberKey = 'school_pro_remember_email';

  email = '';
  password = '';
  rememberMe = true;
  showPassword = signal(false);
  loading = signal(false);
  error = signal('');

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

  ngOnInit() {
    const saved = localStorage.getItem(this.rememberKey);
    if (saved) {
      this.email = saved;
      this.rememberMe = true;
    } else {
      this.email = 'admin@schoolpro.ac.zw';
    }
    this.password = this.demoPassword;
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  fillDemo(account: DemoAccount) {
    this.email = account.email;
    this.password = this.demoPassword;
    this.error.set('');
  }

  onSubmit() {
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

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
}
