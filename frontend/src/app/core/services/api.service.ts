import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  get<T>(path: string, params?: Record<string, string>) {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v) httpParams = httpParams.set(k, v); });
    }
    return this.http.get<T>(`${this.base}${path}`, { params: httpParams });
  }

  post<T>(path: string, body: unknown) {
    return this.http.post<T>(`${this.base}${path}`, body);
  }

  postFormData<T>(path: string, formData: FormData) {
    return this.http.post<T>(`${this.base}${path}`, formData);
  }

  putFormData<T>(path: string, formData: FormData) {
    return this.http.put<T>(`${this.base}${path}`, formData);
  }

  put<T>(path: string, body: unknown) {
    return this.http.put<T>(`${this.base}${path}`, body);
  }

  patch<T>(path: string, body: unknown) {
    return this.http.patch<T>(`${this.base}${path}`, body);
  }

  delete<T>(path: string, params?: Record<string, string>) {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') httpParams = httpParams.set(k, v);
      });
    }
    return this.http.delete<T>(`${this.base}${path}`, { params: httpParams });
  }

  uploadFile<T>(path: string, file: File, fieldName = 'file') {
    const form = new FormData();
    form.append(fieldName, file);
    return this.http.post<T>(`${this.base}${path}`, form);
  }

  getBlob(path: string, params?: Record<string, string>) {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') httpParams = httpParams.set(k, v);
      });
    }
    return this.http.get(`${this.base}${path}`, { params: httpParams, responseType: 'blob' });
  }

  postBlob(path: string, body: unknown, params?: Record<string, string>) {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') httpParams = httpParams.set(k, v);
      });
    }
    return this.http.post(`${this.base}${path}`, body, {
      params: httpParams,
      responseType: 'blob',
    });
  }
}
