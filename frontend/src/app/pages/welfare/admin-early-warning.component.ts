import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Flag {
  studentId: string;
  studentName?: string;
  severity: 'high' | 'medium' | 'low' | string;
  score: number;
  reasons: string[];
  metrics: {
    markTrend?: { previousAvg: number; currentAvg: number; delta: number };
    absence?: { recentAbsences: number; recentRate: number; priorRate: number };
    arrears?: { outstanding: number; overdueInvoices: number };
  };
}
interface ProgressPoint { termName: string; average: number | null; attendanceRate: number | null; subjects: number }

type SortKey = 'score' | 'name' | 'arrears';

/** Highest score the scan can produce (3 marks + 2 low average + 3 absence + 3 arrears). */
const MAX_SCORE = 11;

@Component({
  selector: 'app-admin-early-warning',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-early-warning.component.html',
  styleUrl: './admin-early-warning.component.scss',
})
export class AdminEarlyWarningComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly abs = Math.abs;

  classes: any[] = [];
  classId = '';
  severity = '';

  flags = signal<Flag[]>([]);
  loading = signal(false);
  loaded = signal(false);
  error = signal('');
  search = signal('');
  sortKey = signal<SortKey>('score');
  sortDir = signal<'asc' | 'desc'>('desc');

  counts = computed(() => {
    const all = this.flags();
    return {
      total: all.length,
      high: all.filter((f) => f.severity === 'high').length,
      medium: all.filter((f) => f.severity === 'medium').length,
      low: all.filter((f) => f.severity === 'low').length,
    };
  });

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const rows = q ? this.flags().filter((f) => (f.studentName || '').toLowerCase().includes(q)) : [...this.flags()];
    return rows.sort((a, b) => {
      let cmp = 0;
      if (key === 'name') cmp = (a.studentName || '').localeCompare(b.studentName || '');
      else if (key === 'arrears') cmp = (a.metrics.arrears?.outstanding || 0) - (b.metrics.arrears?.outstanding || 0);
      else cmp = a.score - b.score;
      return cmp * dir || a.score - b.score;
    });
  });

  // Progress panel
  progressFor = signal<Flag | null>(null);
  progress = signal<ProgressPoint[]>([]);
  progressLoading = signal(false);
  progressError = signal('');

  ngOnInit() {
    this.api.get<any[]>('/admin/classes').subscribe({ next: (r) => (this.classes = r || []), error: () => {} });
    this.load();
  }

  load() {
    const p: any = {};
    if (this.classId) p.classId = this.classId;
    if (this.severity) p.minSeverity = this.severity;
    this.loading.set(true);
    this.error.set('');
    this.api.get<Flag[]>('/early-warning/students', p).subscribe({
      next: (r) => {
        this.flags.set(r || []);
        this.loading.set(false);
        this.loaded.set(true);
        // A scan can remove the student whose progress is open.
        const open = this.progressFor();
        if (open && !(r || []).some((f) => f.studentId === open.studentId)) this.closeProgress();
      },
      error: (e) => {
        this.flags.set([]);
        this.loading.set(false);
        this.loaded.set(true);
        this.error.set(e?.error?.message || `The scan could not be completed (${e?.status ?? 'no response'}). Please try again.`);
      },
    });
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  initials(name?: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  scorePct(score: number): number {
    return Math.min(100, Math.round((score / MAX_SCORE) * 100));
  }

  markTone(v: number | null): string {
    const n = v ?? 0;
    return n < 40 ? 'bad' : n < 60 ? 'warn' : 'ok';
  }

  attendanceTone(v: number | null): string {
    return (v ?? 0) < 80 ? 'bad' : 'ok';
  }

  showProgress(f: Flag) {
    this.progressFor.set(f);
    this.progress.set([]);
    this.progressError.set('');
    this.progressLoading.set(true);
    setTimeout(() => document.getElementById('ew-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    this.api.get<{ terms: ProgressPoint[] }>(`/early-warning/progress/${f.studentId}`).subscribe({
      next: (r) => {
        this.progress.set(r?.terms || []);
        this.progressLoading.set(false);
      },
      error: (e) => {
        this.progressLoading.set(false);
        this.progressError.set(e?.error?.message || 'Could not load this student\u2019s progress.');
      },
    });
  }

  closeProgress() {
    this.progressFor.set(null);
    this.progress.set([]);
    this.progressError.set('');
  }
}
