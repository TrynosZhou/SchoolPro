import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { resolveExecutivePortalLayout } from '../../core/utils/portal-layout.util';

interface FieldDef {
  key: string;
  label: string;
  type: string;
}

interface DatasetMeta {
  key: string;
  label: string;
  description: string;
  fields: FieldDef[];
  filters: string[];
  defaultFields: string[];
  groupable: string[];
}

interface FilterMeta {
  id: string;
  label: string;
  type: string;
}

interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  config: ReportConfig;
  createdAt: string;
  updatedAt: string;
}

interface ReportConfig {
  dataset: string;
  fields: string[];
  filters?: Record<string, string>;
  groupBy?: string | null;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
}

interface ReportResult {
  dataset: string;
  datasetLabel: string;
  columns: FieldDef[];
  rows: Record<string, unknown>[];
  groupBy: string | null;
  totalRows: number;
  generatedAt: string;
}

interface FilterOptions {
  schoolYears: { id: string; name: string }[];
  terms: { id: string; name: string; schoolYearId: string }[];
  classes: { id: string; name: string }[];
  forms: { id: string; name: string }[];
}

@Component({
  selector: 'app-admin-report-builder',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  templateUrl: './admin-report-builder.component.html',
  styleUrl: './admin-report-builder.component.scss',
})
export class AdminReportBuilderComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly portalLayout = resolveExecutivePortalLayout(this.router);

  datasets = signal<DatasetMeta[]>([]);
  filterMeta = signal<FilterMeta[]>([]);
  filterOptions = signal<FilterOptions>({ schoolYears: [], terms: [], classes: [], forms: [] });
  templates = signal<ReportTemplate[]>([]);
  metaLoading = signal(true);

  config: ReportConfig = {
    dataset: 'students',
    fields: [],
    filters: {},
    groupBy: null,
    sortBy: null,
    sortDir: 'asc',
  };

  /** Bumps when config changes so computed helpers re-evaluate. */
  private configTick = signal(0);

  reportTitle = 'Custom Report';
  templateName = '';
  templateDescription = '';
  selectedTemplateId = '';

  result = signal<ReportResult | null>(null);
  loading = signal(false);
  exporting = signal(false);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  readonly activeDataset = computed(() => {
    this.configTick();
    return this.datasets().find((d) => d.key === this.config.dataset);
  });

  readonly availableFilters = computed(() => {
    const ds = this.activeDataset();
    const all = this.filterMeta();
    return ds ? all.filter((f) => ds.filters.includes(f.id)) : [];
  });

  readonly selectedFieldCount = computed(() => {
    this.configTick();
    return this.config.fields.length;
  });

  readonly activeFilterCount = computed(() => {
    this.configTick();
    const filters = this.config.filters || {};
    return Object.values(filters).filter((v) => v != null && String(v).trim() !== '').length;
  });

  readonly resultRows = computed(() => this.result()?.totalRows ?? 0);

  ngOnInit(): void {
    this.api.get<{ datasets: DatasetMeta[]; filters: FilterMeta[] }>('/reports/meta').subscribe({
      next: (meta) => {
        this.datasets.set(meta.datasets);
        this.filterMeta.set(meta.filters);
        this.applyDatasetDefaults('students');
        this.metaLoading.set(false);
      },
      error: () => {
        this.metaLoading.set(false);
        this.showToast('error', 'Could not load report metadata.');
      },
    });
    this.api.get<FilterOptions>('/analytics/filters').subscribe({
      next: (opts) => this.filterOptions.set(opts),
    });
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.api.get<ReportTemplate[]>('/reports/templates').subscribe({
      next: (t) => this.templates.set(t),
    });
  }

  onDatasetChange(): void {
    this.applyDatasetDefaults(this.config.dataset);
    this.result.set(null);
    this.bumpConfig();
  }

  private applyDatasetDefaults(datasetKey: string): void {
    const ds = this.datasets().find((d) => d.key === datasetKey);
    if (!ds) return;
    this.config.fields = [...ds.defaultFields];
    this.config.filters = {};
    this.config.groupBy = null;
    this.config.sortBy = null;
    this.config.sortDir = 'asc';
    this.bumpConfig();
  }

  private bumpConfig(): void {
    this.configTick.update((n) => n + 1);
  }

  toggleField(key: string): void {
    const idx = this.config.fields.indexOf(key);
    if (idx >= 0) this.config.fields.splice(idx, 1);
    else this.config.fields.push(key);
    this.bumpConfig();
  }

  selectAllFields(): void {
    const fields = this.activeDataset()?.fields ?? [];
    this.config.fields = fields.map((f) => f.key);
    this.bumpConfig();
  }

  clearFields(): void {
    this.config.fields = [];
    this.bumpConfig();
  }

  isFieldSelected(key: string): boolean {
    return this.config.fields.includes(key);
  }

  onFilterChange(): void {
    this.bumpConfig();
  }

  onGroupByChange(): void {
    this.bumpConfig();
  }

  newReport(): void {
    this.selectedTemplateId = '';
    this.templateName = '';
    this.templateDescription = '';
    this.reportTitle = 'Custom Report';
    this.applyDatasetDefaults(this.config.dataset || 'students');
    this.result.set(null);
  }

  loadTemplate(): void {
    if (!this.selectedTemplateId) {
      this.newReport();
      return;
    }
    const t = this.templates().find((x) => x.id === this.selectedTemplateId);
    if (!t) return;
    this.config = {
      ...t.config,
      filters: { ...(t.config.filters || {}) },
      fields: [...(t.config.fields || [])],
    };
    this.templateName = t.name;
    this.templateDescription = t.description || '';
    this.reportTitle = t.name;
    this.bumpConfig();
    this.runReport();
  }

  buildPayload(): ReportConfig {
    return {
      dataset: this.config.dataset,
      fields: [...this.config.fields],
      filters: { ...(this.config.filters || {}) },
      groupBy: this.config.groupBy || null,
      sortBy: this.config.sortBy || null,
      sortDir: this.config.sortDir || 'asc',
    };
  }

  runReport(): void {
    if (!this.config.fields.length) {
      this.showToast('error', 'Select at least one field.');
      return;
    }
    this.loading.set(true);
    this.api.post<ReportResult>('/reports/run', this.buildPayload()).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.showToast('error', err?.error?.message || 'Failed to run report.');
      },
    });
  }

  exportReport(format: 'csv' | 'xlsx' | 'pdf'): void {
    if (!this.config.fields.length) {
      this.showToast('error', 'Select at least one field.');
      return;
    }
    this.exporting.set(true);
    const token = this.auth.getToken();
    this.http
      .post(
        `${environment.apiUrl}/reports/export?format=${format}`,
        {
          ...this.buildPayload(),
          title: this.reportTitle,
        },
        {
          responseType: 'blob',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      .subscribe({
        next: (blob) => {
          const ext = format === 'xlsx' ? 'xlsx' : format;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.reportTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'report'}.${ext}`;
          a.click();
          URL.revokeObjectURL(url);
          this.exporting.set(false);
          this.showToast('success', `Report exported as ${ext.toUpperCase()}.`);
        },
        error: () => {
          this.exporting.set(false);
          this.showToast('error', 'Export failed.');
        },
      });
  }

  saveTemplate(): void {
    const name = this.templateName.trim();
    if (!name) {
      this.showToast('error', 'Enter a template name.');
      return;
    }
    this.saving.set(true);
    const body = {
      name,
      description: this.templateDescription.trim() || undefined,
      config: this.buildPayload(),
    };
    const req = this.selectedTemplateId
      ? this.api.put<ReportTemplate>(`/reports/templates/${this.selectedTemplateId}`, body)
      : this.api.post<ReportTemplate>('/reports/templates', body);
    req.subscribe({
      next: (t) => {
        this.saving.set(false);
        this.selectedTemplateId = t.id;
        this.loadTemplates();
        this.showToast('success', 'Template saved.');
      },
      error: (err) => {
        this.saving.set(false);
        this.showToast('error', err?.error?.message || 'Failed to save template.');
      },
    });
  }

  deleteTemplate(): void {
    if (!this.selectedTemplateId) return;
    if (!confirm('Delete this saved template?')) return;
    this.api.delete(`/reports/templates/${this.selectedTemplateId}`).subscribe({
      next: () => {
        this.selectedTemplateId = '';
        this.templateName = '';
        this.templateDescription = '';
        this.loadTemplates();
        this.showToast('success', 'Template deleted.');
      },
    });
  }

  formatCell(value: unknown, type: string): string {
    if (value == null || value === '') return '—';
    if (type === 'money') {
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (type === 'percent') return `${value}%`;
    if (type === 'date') return String(value).slice(0, 10);
    return String(value);
  }

  groupLabel(key: string): string {
    return this.activeDataset()?.fields.find((f) => f.key === key)?.label || key;
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
