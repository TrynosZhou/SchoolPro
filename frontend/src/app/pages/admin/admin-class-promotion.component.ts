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
  students?: { id: string }[];
}

interface PromotionRuleRow {
  id: string;
  fromClassId: string;
  toClassId?: string | null;
  completionLabel?: string | null;
  isActive: boolean;
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

type PromotionPreview =
  | { kind: 'class'; label: string }
  | { kind: 'completion'; label: string }
  | { kind: 'missing' };

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
  refreshing = signal(false);
  promoting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  years = signal<SchoolYearRow[]>([]);
  classes = signal<ClassRow[]>([]);
  promotionRules = signal<PromotionRuleRow[]>([]);
  lastResult = signal<PromotionResult | null>(null);

  selectedCompletingYearId = '';
  selectedClassId = '';
  classSearch = signal('');
  formFilter = signal('all');

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

  classFormOptions = computed(() => {
    const names = new Set<string>();
    for (const c of this.classes()) {
      if (c.form?.name) names.add(c.form.name);
    }
    return [...names].sort();
  });

  visibleClasses = computed(() => {
    let rows = [...this.classes()].sort((a, b) => {
      const la = a.form?.level ?? 0;
      const lb = b.form?.level ?? 0;
      if (la !== lb) return la - lb;
      const fa = a.form?.name || '';
      const fb = b.form?.name || '';
      const fcmp = fa.localeCompare(fb);
      if (fcmp !== 0) return fcmp;
      return a.name.localeCompare(b.name);
    });

    const form = this.formFilter();
    if (form !== 'all') rows = rows.filter((c) => c.form?.name === form);

    const q = this.classSearch().trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        `${c.name} ${c.form?.name ?? ''} ${this.classLabel(c)}`.toLowerCase().includes(q),
      );
    }

    return rows;
  });

  stats = computed(() => {
    const classes = this.classes();
    const rules = this.promotionRules().filter((r) => r.isActive);
    const configuredClassIds = new Set(rules.map((r) => r.fromClassId));
    return {
      years: this.years().length,
      classes: classes.length,
      rules: rules.length,
      unconfigured: classes.filter((c) => !configuredClassIds.has(c.id)).length,
      studentsInSelected: this.selectedClassStudentCount(),
    };
  });

  promotionPreview = computed((): PromotionPreview | null => {
    if (!this.selectedClassId) return null;
    const rule = this.promotionRules().find(
      (r) => r.fromClassId === this.selectedClassId && r.isActive,
    );
    if (!rule) return { kind: 'missing' };
    if (rule.completionLabel) return { kind: 'completion', label: rule.completionLabel };
    const toClass = this.classes().find((c) => c.id === rule.toClassId);
    return { kind: 'class', label: toClass ? this.classLabel(toClass) : 'Unknown class' };
  });

  canPromote = computed(
    () =>
      Boolean(this.selectedCompletingYearId) &&
      Boolean(this.selectedClassId) &&
      Boolean(this.targetYear()) &&
      this.promotionPreview()?.kind !== 'missing',
  );

  selectedClassLabel = computed(() => {
    const c = this.classes().find((row) => row.id === this.selectedClassId);
    return c ? this.classLabel(c) : '';
  });

  hasPromotionRule(classId: string): boolean {
    return this.promotionRules().some((r) => r.fromClassId === classId && r.isActive);
  }

  ngOnInit() {
    this.load();
  }

  load(refresh = false) {
    if (refresh) this.refreshing.set(true);
    else this.loading.set(true);

    let yearsDone = false;
    let classesDone = false;
    let rulesDone = false;

    const finish = () => {
      if (yearsDone && classesDone && rulesDone) {
        this.loading.set(false);
        this.refreshing.set(false);
      }
    };

    this.api.get<SchoolYearRow[]>('/admin/school-years').subscribe({
      next: (y) => {
        this.years.set(y);
        if (!this.selectedCompletingYearId) {
          this.selectedCompletingYearId = this.defaultCompletingYearId(y);
        }
        yearsDone = true;
        finish();
      },
      error: () => {
        yearsDone = true;
        finish();
        this.showToast('error', 'Failed to load school years');
      },
    });

    this.api.get<ClassRow[]>('/admin/classes').subscribe({
      next: (c) => {
        this.classes.set(c);
        classesDone = true;
        finish();
      },
      error: () => {
        classesDone = true;
        finish();
        this.showToast('error', 'Failed to load classes');
      },
    });

    this.api.get<PromotionRuleRow[]>('/admin/promotion-rules').subscribe({
      next: (r) => {
        this.promotionRules.set(r);
        rulesDone = true;
        finish();
      },
      error: () => {
        rulesDone = true;
        finish();
        this.showToast('error', 'Failed to load promotion rules');
      },
    });
  }

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

  classStudentCount(c: ClassRow): number {
    return c.students?.length ?? 0;
  }

  selectedClassStudentCount(): number {
    const c = this.classes().find((row) => row.id === this.selectedClassId);
    return c ? this.classStudentCount(c) : 0;
  }

  selectClass(classId: string) {
    this.selectedClassId = classId;
    this.lastResult.set(null);
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

    const preview = this.promotionPreview();
    if (preview?.kind === 'missing') {
      this.showToast('error', 'Configure a promotion rule for this class in Academic Settings.');
      return;
    }

    const from = this.classLabel(this.classes().find((c) => c.id === this.selectedClassId)!);
    const completing = this.completingYear()!.name;
    const into = target.name;
    const destination =
      preview?.kind === 'completion' ? preview.label : preview?.kind === 'class' ? preview.label : 'next class';

    if (
      !confirm(
        `Year-end promotion: move ALL active students in ${from} from school year ${completing} to ${destination} for ${into}?`,
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
          this.lastResult.set(r);
          this.load(true);
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
