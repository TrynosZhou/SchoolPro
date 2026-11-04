import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_PUBLIC_PATHS = /\/auth\/(login|student-login|register|forgot-password|reset-password|password-policy)(\/|$|\?)/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  auth.clearExpiredSession();
  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !AUTH_PUBLIC_PATHS.test(req.url)) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
