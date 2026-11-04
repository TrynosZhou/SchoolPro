import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import {
  LmsApiService,
  LibraryResource,
  LibraryBookmark,
  LibraryResourceType,
} from '../../core/services/lms-api.service';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { STUDENT_NAV_SECTIONS } from '../../core/config/student-nav';
import { buildTeacherNavSections } from '../../core/config/teacher-nav';

interface SubjectOption { id: string; name: string }
interface FormOption { id: string; name: string }

type LibraryView = 'catalog' | 'bookmarks';

@Component({
  selector: 'app-lms-library',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './lms-library.component.html',
  styleUrl: './lms-library.component.scss',
})
export class LmsLibraryComponent implements OnInit {
  private api = inject(ApiService);
  private lms = inject(LmsApiService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly isStudent = this.router.url.startsWith('/student');
  readonly isAdmin = this.router.url.startsWith('/admin');
  readonly canManage = !this.isStudent;

  readonly portalTitle = this.isStudent
    ? 'Student Portal'
    : this.isAdmin
      ? 'Admin Portal'
      : 'Teacher Portal';
  readonly homePath = this.isStudent ? '/student' : this.isAdmin ? '/admin' : '/teacher';
  readonly navSections = this.isStudent
    ? STUDENT_NAV_SECTIONS
    : this.isAdmin
      ? ADMIN_NAV_SECTIONS
      : buildTeacherNavSections(this.auth.user()?.permissions);

  resources = signal<LibraryResource[]>([]);
  bookmarks = signal<LibraryBookmark[]>([]);
  bookmarkIds = signal<Set<string>>(new Set());
  subjects = signal<SubjectOption[]>([]);
  forms = signal<FormOption[]>([]);

  q = '';
  subjectId = '';
  gradeFormId = '';
  resourceType = '';

  title = '';
  description = '';
  type: LibraryResourceType = 'pdf';
  externalUrl = '';
  uploadSubjectId = '';
  uploadFormId = '';
  file: File | null = null;
  fileInputKey = signal(0);

  loading = signal(true);
  busy = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  view = signal<LibraryView>('catalog');
  showUpload = signal(false);

  readonly resourceCount = computed(() => this.resources().length);
  readonly bookmarkCount = computed(() => this.bookmarks().length);

  get hasFilters(): boolean {
    return Boolean(this.q.trim() || this.subjectId || this.gradeFormId || this.resourceType);
  }

  readonly typeBreakdown = computed(() => {
    const counts: Record<string, number> = {};
    for (const r of this.resources()) {
      counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  });

  ngOnInit(): void {
    this.reload();
    this.lms.listBookmarks().subscribe({
      next: (rows) => {
        this.bookmarks.set(rows);
        this.bookmarkIds.set(new Set(rows.map((b) => b.resourceId)));
      },
    });
    if (this.canManage) {
      this.api.get<SubjectOption[]>('/admin/subjects').subscribe({
        next: (rows) => this.subjects.set(rows),
        error: () => undefined,
      });
      this.api.get<FormOption[]>('/admin/forms').subscribe({
        next: (rows) => this.forms.set(rows),
        error: () => undefined,
      });
    }
  }

  setView(next: LibraryView): void {
    this.view.set(next);
  }

  clearFilters(): void {
    this.q = '';
    this.subjectId = '';
    this.gradeFormId = '';
    this.resourceType = '';
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.q.trim()) params['q'] = this.q.trim();
    if (this.subjectId) params['subjectId'] = this.subjectId;
    if (this.gradeFormId) params['gradeFormId'] = this.gradeFormId;
    if (this.resourceType) params['resourceType'] = this.resourceType;
    this.lms.listLibrary(params).subscribe({
      next: (rows) => {
        this.resources.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.resources.set([]);
        this.loading.set(false);
      },
    });
  }

  onFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  upload(): void {
    if (!this.title.trim()) {
      this.showToast('error', 'Title is required.');
      return;
    }
    if (this.type === 'link' && !this.externalUrl.trim()) {
      this.showToast('error', 'External URL is required for link resources.');
      return;
    }
    if (this.type !== 'link' && !this.file && !this.externalUrl.trim()) {
      this.showToast('error', 'Upload a file or provide an external URL.');
      return;
    }

    const form = new FormData();
    form.append('title', this.title.trim());
    if (this.description.trim()) form.append('description', this.description.trim());
    form.append('resourceType', this.type);
    if (this.externalUrl.trim()) form.append('externalUrl', this.externalUrl.trim());
    if (this.uploadSubjectId) form.append('subjectId', this.uploadSubjectId);
    if (this.uploadFormId) form.append('gradeFormId', this.uploadFormId);
    if (this.file) form.append('file', this.file);

    this.busy.set(true);
    this.lms.createLibraryResource(form).subscribe({
      next: () => {
        this.busy.set(false);
        this.title = '';
        this.description = '';
        this.externalUrl = '';
        this.file = null;
        this.fileInputKey.update((n) => n + 1); // remount file input via @if
        this.q = '';
        this.subjectId = '';
        this.gradeFormId = '';
        this.resourceType = '';
        this.view.set('catalog');
        this.showUpload.set(false);
        this.showToast('success', 'Resource added.');
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.showToast('error', e.error?.message || 'Upload failed.');
      },
    });
  }

  remove(id: string): void {
    if (!confirm('Delete this resource? This cannot be undone.')) return;
    this.lms.deleteLibraryResource(id).subscribe({
      next: () => {
        this.showToast('success', 'Resource deleted.');
        this.reload();
      },
      error: (e) => this.showToast('error', e.error?.message || 'Delete failed.'),
    });
  }

  toggleBookmark(id: string): void {
    if (this.bookmarkIds().has(id)) {
      this.lms.removeBookmark(id).subscribe({
        next: () => {
          this.bookmarkIds.update((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          this.bookmarks.update((rows) => rows.filter((b) => b.resourceId !== id));
        },
        error: (e) => this.showToast('error', e.error?.message || 'Could not remove bookmark.'),
      });
    } else {
      this.lms.bookmark(id).subscribe({
        next: (b) => {
          this.bookmarkIds.update((s) => new Set(s).add(id));
          this.bookmarks.update((rows) => [b, ...rows]);
        },
        error: (e) => this.showToast('error', e.error?.message || 'Could not bookmark.'),
      });
    }
  }

  href(url?: string | null): string | null {
    return this.lms.fileUrl(url);
  }

  typeLabel(type?: string | null): string {
    if (!type) return 'Resource';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
