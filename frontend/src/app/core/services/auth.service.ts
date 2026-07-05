import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthResponse, User, UserRole } from '../models';

const TOKEN_KEY = 'school_pro_token';
const USER_KEY = 'school_pro_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private userSignal = signal<User | null>(this.loadUser());
  user = this.userSignal.asReadonly();
  isLoggedIn = computed(() => {
    const token = this.getToken();
    return !!this.userSignal() && !!token && !this.isTokenExpired(token);
  });

  login(username: string, password: string) {
    return this.api.post<AuthResponse>('/auth/login', { username, password }).pipe(
      tap((res) => this.persistSession(res))
    );
  }

  /** Student portal: Student ID + date of birth (YYYY-MM-DD). */
  studentLogin(admissionNumber: string, dateOfBirth: string) {
    return this.api.post<AuthResponse>('/auth/student-login', { admissionNumber, dateOfBirth }).pipe(
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

  register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'parent';
    phone?: string;
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
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
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
      this.userSignal.set(null);
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
      teacher: '/teacher',
      parent: '/parent',
      student: '/student',
    };
    return role ? map[role] : '/login';
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
