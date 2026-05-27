import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface SchoolYearRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

interface ClassRow {
  id: string;
  name: string;
  form?: { id: string; name: string; level: number };
  formId: string;
}

interface PromotionResult {
  promoted: number;
  completingSchoolYearId: string;
  targetSchoolYearId: string;
  fromClassId: string;
  toClassId?: string;
  completionLabel?: string;
  message: string;
}

function schoolYearCalendarYear(y: SchoolYearRow): number {
  const matches = String(y.name).match(/20\d{2}/g);
  if (matches?.length) return parseInt(matches[0], 10);
  return new Date(y.startDate).getFullYear();
}

@Component({
  selector: 'app-admin-class-promotion',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, RouterLink],
  templateUrl: './admin-class-promotion.component.html',
  styleUrl: './admin-class-promotion.component.scss',
})
export class AdminClassPromotionComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  loading = signal(true);
  promoting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  years = signal<SchoolYearRow[]>([]);
  classes = signal<ClassRow[]>([]);

  selectedCompletingYearId = '';
  selectedClassId = '';

  sortedYears = computed(() =>
    [...this.years()].sort((a, b) => schoolYearCalendarYear(b) - schoolYearCalendarYear(a)),
  );

  completingYear = computed(() =>
    this.years().find((y) => y.id === this.selectedCompletingYearId) ?? null,
  );

  targetYear = computed(() => {
    const completing = this.completingYear();
    if (!completing) return null;
    const nextCal = schoolYearCalendarYear(completing) + 1;
    const matches = this.years()
      .filter((y) => schoolYearCalendarYear(y) === nextCal)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return matches[0] ?? null;
  });

  sortedClasses = computed(() =>
    [...this.classes()].sort((a, b) => {
      const la = a.form?.level ?? 0;
      const lb = b.form?.level ?? 0;
      if (la !== lb) return la - lb;
      const fa = a.form?.name || '';
      const fb = b.form?.name || '';
      const fcmp = fa.localeCompare(fb);
      if (fcmp !== 0) return fcmp;
      return a.name.localeCompare(b.name);
    }),
  );

  ngOnInit() {
    this.loading.set(true);
    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (y) => {
        this.years.set(y);
        this.selectedCompletingYearId = this.defaultCompletingYearId(y);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load school years');
      },
    });

    this.api.get<ClassRow[]>('/admin/classes').subscribe({
      next: (c) => this.classes.set(c),
      error: () => this.showToast('error', 'Failed to load classes'),
    });
  }

  /** Prefer the most recently ended school year (year-end promotion). */
  private defaultCompletingYearId(years: SchoolYearRow[]): string {
    if (!years.length) return '';
    const today = new Date().toISOString().slice(0, 10);
    const ended = [...years]
      .filter((y) => y.endDate < today)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    if (ended[0]) return ended[0].id;

    const cal = new Date().getFullYear();
    const prev = years.find((y) => schoolYearCalendarYear(y) === cal - 1);
    if (prev) return prev.id;

    const sorted = [...years].sort((a, b) => schoolYearCalendarYear(b) - schoolYearCalendarYear(a));
    return sorted[1]?.id ?? sorted[0]?.id ?? '';
  }

  classLabel(c: ClassRow): string {
    return `${c.form?.name || 'Form'} ${c.name}`;
  }

  promote() {
    if (!this.selectedCompletingYearId || !this.selectedClassId) {
      this.showToast('error', 'Select the completing school year and a class.');
      return;
    }
    const target = this.targetYear();
    if (!target) {
      this.showToast(
        'error',
        `Add a school year for ${schoolYearCalendarYear(this.completingYear()!) + 1} in Academic Settings before promoting.`,
      );
      return;
    }

    const from = this.classLabel(this.classes().find((c) => c.id === this.selectedClassId)!);
    const completing = this.completingYear()!.name;
    const into = target.name;
    if (
      !confirm(
        `Year-end promotion: move ALL active students in ${from} from school year ${completing} into classes for ${into}?`,
      )
    ) {
      return;
    }

    this.promoting.set(true);
    this.api
      .post<PromotionResult>('/admin/class-promotion/promote', {
        completingSchoolYearId: this.selectedCompletingYearId,
        targetSchoolYearId: target.id,
        classId: this.selectedClassId,
      })
      .subscribe({
        next: (r) => {
          this.promoting.set(false);
          this.showToast('success', r.message || `Promoted ${r.promoted} student(s).`);
        },
        error: (e) => {
          this.promoting.set(false);
          this.showToast('error', e.error?.message || 'Promotion failed');
        },
      });
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
