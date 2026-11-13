import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { formatStudentClassLabel, formatTitledFullName } from '../../core/utils/class-display';
import { AuthService } from '../../core/services/auth.service';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { changePasswordDashboardLink } from '../../core/utils/change-password-route.util';

interface ParentChildSummary {
  linkId?: string;
  relationship?: string;
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    className?: string;
    formName?: string;
  };
  balanceOwed: number;
  recentAssessments: { topic: string; score?: number; maxScore?: number; weekStart: string }[];
  attendance: { status: string; count: string }[];
}

interface AttendanceSegment {
  key: 'present' | 'late' | 'excused' | 'absent';
  label: string;
  count: number;
  percent: number;
}

interface AttendanceBreakdown {
  total: number;
  present: number;
  rate: number;
  segments: AttendanceSegment[];
}

interface StudentMatch {
  id: string;
  admissionNumber?: string;
  firstName: string;
  lastName: string;
  gender?: string;
  className?: string;
  formName?: string;
  alreadyLinked?: boolean;
}

@Component({
  selector: 'app-parent-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, DatePipe, RouterLink, FormsModule],
  templateUrl: './parent-dashboard.component.html',
  styleUrl: './parent-dashboard.component.scss',
})
export class ParentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  children = signal<ParentChildSummary[]>([]);
  currencySymbol = signal('$');
  loading = signal(true);
  showLinkForm = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  searching = signal(false);
  hasSearched = signal(false);
  results = signal<StudentMatch[]>([]);
  linkingId = signal<string | null>(null);
  unlinkingId = signal<string | null>(null);

  linkForm = {
    term: '',
    relationship: 'Parent',
  };

  readonly nav = PARENT_NAV_ITEMS;
  readonly changePasswordLink = changePasswordDashboardLink('parent');

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  readonly greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  readonly greetingName = computed(() => {
    const u = this.auth.user();
    if (!u) return 'Parent';
    const titled = formatTitledFullName(u.firstName, u.lastName, u.gender);
    return titled || 'Parent';
  });

  childCount = computed(() => this.children().length);

  /** Combined outstanding fees across every linked child. */
  totalOwed = computed(() => this.children().reduce((sum, c) => sum + (c.balanceOwed || 0), 0));

  isParent = computed(() => this.auth.user()?.role === 'parent');

  ngOnInit() {
    this.api.get<{ currency?: string }>('/dashboard/school-links').subscribe({
      next: (data) => {
        if (data.currency) {
          const sym = data.currency === 'INR' ? '₹' : data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';
          this.currencySymbol.set(sym);
        }
      },
    });

    this.api.get<{ gender?: string | null }>('/auth/me').subscribe({
      next: (profile) => {
        if (profile.gender != null) {
          this.auth.patchUser({ gender: profile.gender });
        }
      },
    });

    this.loadChildren();
  }

  loadChildren() {
    this.loading.set(true);
    this.api.get<ParentChildSummary[]>('/dashboard/parent').subscribe({
      next: (d) => {
        this.children.set(d);
        this.loading.set(false);
        if (!d.length && this.isParent()) {
          this.showLinkForm.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load linked children');
      },
    });
  }

  toggleLinkForm() {
    this.showLinkForm.update((v) => {
      const next = !v;
      if (!next) this.resetSearch();
      return next;
    });
  }

  resetSearch() {
    this.linkForm = { term: '', relationship: this.linkForm.relationship };
    this.results.set([]);
    this.hasSearched.set(false);
  }

  searchChildren() {
    const term = this.linkForm.term.trim();
    if (term.length < 2) {
      this.showToast('error', 'Enter a Student ID or last name (at least 2 characters)');
      return;
    }

    this.searching.set(true);
    this.api.get<StudentMatch[]>('/students/parent/search', { q: term }).subscribe({
      next: (rows) => {
        this.searching.set(false);
        this.hasSearched.set(true);
        this.results.set(rows);
      },
      error: (e) => {
        this.searching.set(false);
        this.hasSearched.set(true);
        this.results.set([]);
        this.showToast('error', e.error?.message || 'Search failed. Try again.');
      },
    });
  }

  linkSelected(match: StudentMatch) {
    if (match.alreadyLinked || this.linkingId()) return;

    this.linkingId.set(match.id);
    this.api.post<{ message: string }>('/students/parent/link-child', {
      studentId: match.id,
      relationship: this.linkForm.relationship,
    }).subscribe({
      next: (res) => {
        this.linkingId.set(null);
        this.results.update((rows) =>
          rows.map((r) => (r.id === match.id ? { ...r, alreadyLinked: true } : r)),
        );
        this.showToast('success', res.message || 'Child linked to your account.');
        this.loadChildren();
      },
      error: (e) => {
        this.linkingId.set(null);
        this.showToast('error', e.error?.message || 'Could not link child');
      },
    });
  }

  unlinkChild(child: ParentChildSummary) {
    if (this.unlinkingId()) return;

    const name = `${child.student.firstName} ${child.student.lastName}`;
    const ok = confirm(`Unlink ${name} from your account? You can re-link them later using their Student ID or last name.`);
    if (!ok) return;

    this.unlinkingId.set(child.student.id);
    this.api.delete<{ message: string }>(`/students/parent/unlink-child/${child.student.id}`).subscribe({
      next: (res) => {
        this.unlinkingId.set(null);
        this.showToast('success', res.message || `${name} unlinked from your account.`);
        this.loadChildren();
      },
      error: (e) => {
        this.unlinkingId.set(null);
        this.showToast('error', e.error?.message || 'Could not unlink child');
      },
    });
  }

  classLabel(child: ParentChildSummary): string {
    return formatStudentClassLabel(child.student.className);
  }

  initials(first?: string, last?: string): string {
    return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase();
  }

  /** Last-30-day attendance split into present / late / excused / absent, or null when nothing is recorded. */
  attendanceBreakdown(child: ParentChildSummary): AttendanceBreakdown | null {
    const counts: Record<string, number> = {};
    for (const row of child.attendance || []) {
      const key = String(row.status || '').toLowerCase();
      counts[key] = (counts[key] || 0) + (Number(row.count) || 0);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return null;

    const order: { key: AttendanceSegment['key']; label: string }[] = [
      { key: 'present', label: 'Present' },
      { key: 'late', label: 'Late' },
      { key: 'excused', label: 'Excused' },
      { key: 'absent', label: 'Absent' },
    ];
    const segments = order
      .filter((o) => counts[o.key] > 0)
      .map((o) => ({
        key: o.key,
        label: o.label,
        count: counts[o.key],
        percent: (counts[o.key] / total) * 100,
      }));
    const present = counts['present'] || 0;
    return { total, present, rate: Math.round((present / total) * 100), segments };
  }

  /** Score as a 0–100 percentage for the small bar, or null when the score is incomplete. */
  assessmentPercent(a: { score?: number; maxScore?: number }): number | null {
    const score = Number(a.score);
    const max = Number(a.maxScore);
    if (a.score == null || a.maxScore == null || !isFinite(score) || !isFinite(max) || max <= 0) return null;
    return Math.max(0, Math.min(100, (score / max) * 100));
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
