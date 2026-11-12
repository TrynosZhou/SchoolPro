import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface ReportAccessChild {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  className?: string;
  formName?: string;
  relationship?: string;
  viewed: boolean;
  viewedAt?: string | null;
}

interface ReportAccessParent {
  parentId: string;
  name: string;
  email?: string;
  phone?: string;
  totalChildren: number;
  viewedChildren: number;
  unviewedChildren: number;
  children: ReportAccessChild[];
}

interface ReportAccessResult {
  term: { id: string; name: string; isCurrent: boolean } | null;
  examType: { id: string; name: string } | null;
  published: boolean;
  totalParents: number;
  parentsPending: number;
  parentsCompleted: number;
  parents: ReportAccessParent[];
}

@Component({
  selector: 'app-admin-report-view',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink, DatePipe],
  templateUrl: './admin-report-view.component.html',
  styleUrl: './admin-report-view.component.scss',
})
export class AdminReportViewComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;

  readonly terms = signal<{ id: string; name: string; isCurrent?: boolean }[]>([]);
  readonly examTypes = signal<{ id: string; name: string }[]>([]);
  readonly data = signal<ReportAccessResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly expandedParentId = signal<string | null>(null);
  readonly search = signal('');

  selectedTermId = '';
  selectedExamTypeId = '';

  readonly filteredParents = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.data()?.parents ?? [];
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.children.some((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)),
    );
  });

  ngOnInit() {
    this.api.get<{ id: string; name: string; isCurrent?: boolean }[]>('/exams/terms').subscribe({
      next: (terms) => this.terms.set(terms),
    });
    this.api.get<{ id: string; name: string }[]>('/exams/types').subscribe({
      next: (types) => this.examTypes.set(types),
    });
    // No params → server resolves the current term and its current (latest published) exam type.
    this.load();
  }

  onFilterChange() {
    this.expandedParentId.set(null);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get<ReportAccessResult>('/exams/report-access', {
        termId: this.selectedTermId,
        examTypeId: this.selectedExamTypeId,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          if (!this.selectedTermId && res.term) this.selectedTermId = res.term.id;
          if (!this.selectedExamTypeId && res.examType) this.selectedExamTypeId = res.examType.id;
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not load report access.');
        },
      });
  }

  toggleParent(parentId: string) {
    this.expandedParentId.set(this.expandedParentId() === parentId ? null : parentId);
  }

  childClass(c: ReportAccessChild): string {
    return [c.formName, c.className].filter(Boolean).join(' ');
  }
}
