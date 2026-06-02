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
  isLoggedIn = computed(() => !!this.userSignal() && !!this.getToken());

  login(username: string, password: string) {
    return this.api.post<AuthResponse>('/auth/login', { username, password }).pipe(
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
    role: 'parent' | 'student';
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

  hasRole(...roles: UserRole[]): boolean {
    const u = this.userSignal();
    return !!u && roles.includes(u.role);
  }

  getPortalRoute(): string {
    const role = this.userSignal()?.role;
    const map: Record<UserRole, string> = {
      director: '/director',
      principal: '/principal',
      admin: '/admin',
      teacher: '/teacher',
      parent: '/parent',
      student: '/parent',
    };
    return role ? map[role] : '/login';
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
