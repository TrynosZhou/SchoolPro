import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthResponse, User, UserRole } from '../models';
import { changePasswordPathForRole } from '../utils/change-password-route.util';

const TOKEN_KEY = 'school_pro_token';
const USER_KEY = 'school_pro_user';
const DEMO_KEY = 'school_pro_demo';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private userSignal = signal<User | null>(this.loadUser());
  private demoSignal = signal<boolean>(this.loadDemoFlag());

  user = this.userSignal.asReadonly();
  isDemoSession = computed(() => this.demoSignal());

  isLoggedIn = computed(() => {
    const token = this.getToken();
    return !!this.userSignal() && !!token && !this.isTokenExpired(token);
  });

  login(username: string, password: string) {
    return this.api.post<AuthResponse>('/auth/login', { username, password }).pipe(
      tap((res) => this.persistSession(res))
    );
  }

  /** One-click demo sign-in for a fixed role (POST /auth/demo-login). */
  demoLogin(role: UserRole) {
    return this.api.post<AuthResponse>('/auth/demo-login', { role }).pipe(
      tap((res) => this.persistSession(res))
    );
  }

  /** Student portal: Student ID + date of birth (first sign-in) or custom password. */
  studentLogin(admissionNumber: string, password: string) {
    return this.api.post<AuthResponse>('/auth/student-login', { admissionNumber, password }).pipe(
      tap((res) => this.persistSession(res))
    );
  }

  forgotPassword(username: string) {
    return this.api.post<{ message: string; resetUrl?: string; emailSent?: boolean }>(
      '/auth/forgot-password',
      { username }
    );
  }

  resetPassword(token: string, password: string) {
    return this.api.post<{ message: string }>('/auth/reset-password', { token, password });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword });
  }

  register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'parent';
    phone?: string;
    gender?: string;
    admissionNumber?: string;
    dateOfBirth?: string;
    linkAdmissionNumber?: string;
    relationship?: string;
  }) {
    return this.api.post<AuthResponse & { message?: string }>('/auth/register', payload).pipe(
      tap((res) => this.persistSession(res))
    );
  }

  private persistSession(res: AuthResponse) {
    const demo = this.resolveDemoFlag(res);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    localStorage.setItem(DEMO_KEY, demo ? '1' : '0');
    this.userSignal.set(res.user);
    this.demoSignal.set(demo);
  }

  /** Merge fields from /auth/me (e.g. gender from linked staff/student profile). */
  patchUser(partial: Partial<User>) {
    const current = this.userSignal();
    if (!current) return;
    const next = { ...current, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.userSignal.set(next);
  }

  logout() {
    const wasDemo = this.demoSignal();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(DEMO_KEY);
    this.userSignal.set(null);
    this.demoSignal.set(false);
    this.router.navigate([wasDemo ? '/demo' : '/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Clear stale local session when JWT is missing or expired. */
  clearExpiredSession(): void {
    const token = this.getToken();
    if (!token || this.isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(DEMO_KEY);
      this.userSignal.set(null);
      this.demoSignal.set(false);
    }
  }

  private resolveDemoFlag(res: AuthResponse): boolean {
    if (typeof res.demo === 'boolean') return res.demo;
    const token = res.token;
    try {
      const segment = token.split('.')[1];
      if (!segment) return false;
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64)) as { demo?: boolean };
      return payload.demo === true;
    } catch {
      return false;
    }
  }

  private isTokenExpired(token: string): boolean {
    try {
      const segment = token.split('.')[1];
      if (!segment) return true;
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64)) as { exp?: number };
      if (typeof payload.exp !== 'number') return false;
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }

  hasRole(...roles: UserRole[]): boolean {
    const u = this.userSignal();
    return !!u && roles.includes(u.role);
  }

  hasPermission(...keys: string[]): boolean {
    const granted = new Set(this.userSignal()?.permissions ?? []);
    return keys.some((key) => granted.has(key));
  }

  getPortalRoute(): string {
    const role = this.userSignal()?.role;
    const map: Record<UserRole, string> = {
      director: '/director',
      principal: '/principal',
      admin: '/admin',
      accountant: '/accountant',
      teacher: '/teacher',
      parent: '/parent',
      student: '/student',
    };
    return role ? map[role] : '/login';
  }

  getChangePasswordPath(): string | null {
    const role = this.userSignal()?.role;
    if (!role) return null;
    return changePasswordPathForRole(role);
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private loadDemoFlag(): boolean {
    if (localStorage.getItem(DEMO_KEY) === '1') return true;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      const segment = token.split('.')[1];
      if (!segment) return false;
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64)) as { demo?: boolean };
      return payload.demo === true;
    } catch {
      return false;
    }
  }
}
