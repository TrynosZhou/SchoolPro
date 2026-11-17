import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Doc {
  id: string;
  type: string;
  title: string;
  recipientName?: string;
  studentName?: string;
  referenceCode: string;
  issuedAt: string;
  issuedByName?: string;
}
interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  schoolClass?: { name?: string };
}

const TYPES = ['transfer', 'bonafide', 'testimonial', 'achievement', 'completion', 'other'];
const TEMPLATES: Record<string, string> = {
  transfer: 'TO WHOM IT MAY CONCERN\n\nThis is to certify that {name} was a student of {class} during the academic year {year}. Their conduct was satisfactory and all fees have been settled.\n\nWe wish them success in their future endeavours.',
  bonafide: 'TO WHOM IT MAY CONCERN\n\nThis is to certify that {name} is a bonafide student of {class} at our institution.',
  testimonial: 'This is to certify that {name} was a dedicated and well-behaved student. We recommend them without reservation.',
  achievement: 'TO WHOM IT MAY CONCERN\n\nThis is to certify that {name} of {class} has demonstrated outstanding achievement during the {year} academic year, and is commended for their effort and commitment.',
  completion: 'TO WHOM IT MAY CONCERN\n\nThis is to certify that {name} has successfully completed the course of study at {class} in the {year} academic year.',
};

@Component({
  selector: 'app-admin-documents',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule, DatePipe],
  templateUrl: './admin-documents.component.html',
  styleUrl: './admin-documents.component.scss',
})
export class AdminDocumentsComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly types = TYPES;

  // ── Document list ──
  docs = signal<Doc[]>([]);
  loading = signal(false);
  loadError = signal('');
  typeFilter = '';
  search = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  stats = computed(() => {
    const all = this.docs();
    const now = new Date();
    const thisMonth = all.filter((d) => {
      const t = new Date(d.issuedAt);
      return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
    }).length;
    return { total: all.length, thisMonth, kinds: new Set(all.map((d) => d.type)).size };
  });

  // ── Issue form ──
  showForm = signal(false);
  doc: any = { type: 'bonafide' };
  saving = signal(false);
  saveMsg = signal('');
  saveError = signal('');

  // ── Student search (type first name, last name or student ID) ──
  students = signal<Student[]>([]);
  studentQuery = signal('');
  showSuggest = signal(false);
  activeIdx = signal(0);

  matches = computed(() => {
    const tokens = this.studentQuery().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return this.students()
      .filter((s) => {
        const hay = `${s.firstName} ${s.lastName} ${s.admissionNumber || ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName))
      .slice(0, 50);
  });

  // ── Printing ──
  printingId = signal<string | null>(null);
  printError = signal('');

  ngOnInit() {
    this.load();
    this.api.get<Student[]>('/students').subscribe({ next: (r) => this.students.set(r || []), error: () => {} });
  }

  load() {
    const p: any = {};
    if (this.typeFilter) p.type = this.typeFilter;
    if (this.search().trim()) p.q = this.search().trim();
    this.loading.set(true);
    this.loadError.set('');
    this.api.get<Doc[]>('/documents', p).subscribe({
      next: (r) => {
        this.docs.set(r || []);
        this.loading.set(false);
      },
      error: (e) => {
        this.docs.set([]);
        this.loading.set(false);
        this.loadError.set(e?.error?.message || `Could not load documents (${e?.status ?? 'no response'}).`);
      },
    });
  }

  onSearch(value: string) {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  clearFilters() {
    this.typeFilter = '';
    this.search.set('');
    this.load();
  }

  typeLabel(t: string): string {
    return t ? t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ') : '';
  }

  // ── Issue form ──
  toggleForm() {
    this.showForm.set(!this.showForm());
    this.saveError.set('');
  }

  cancelForm() {
    this.showForm.set(false);
    this.saveError.set('');
    this.doc = { type: 'bonafide' };
    this.clearStudent();
  }

  applyTemplate() {
    const s = this.students().find((x) => x.id === this.doc.studentId);
    const name = s ? `${s.firstName} ${s.lastName}` : '{name}';
    const cls = s?.schoolClass?.name || '{class}';
    const year = new Date().getFullYear();
    const tpl = TEMPLATES[this.doc.type] ?? 'TO WHOM IT MAY CONCERN\n\n';
    this.doc.body = tpl.replaceAll('{name}', name).replaceAll('{class}', cls).replaceAll('{year}', String(year));
    if (!this.doc.title) this.doc.title = this.typeLabel(this.doc.type);
  }

  save() {
    this.saveMsg.set('');
    this.saveError.set('');
    if (!this.doc.title || !this.doc.body) {
      this.saveError.set('Enter a title and the document text.');
      return;
    }
    if (this.studentQuery().trim() && !this.doc.studentId) {
      this.saveError.set('Choose the student from the search results, or clear the student box.');
      return;
    }
    this.saving.set(true);
    this.api.post<{ referenceCode: string }>('/documents', this.doc).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.saveMsg.set(`Document issued${created?.referenceCode ? ` (ref ${created.referenceCode})` : ''}.`);
        this.showForm.set(false);
        this.doc = { type: 'bonafide' };
        this.clearStudent();
        // Show the new document: clear the filters so it is not hidden by them.
        this.typeFilter = '';
        this.search.set('');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.saveError.set(e?.error?.message || `Could not issue the document (${e?.status ?? 'no response'}).`);
      },
    });
  }

  // ── Student search handlers ──
  onStudentQuery(value: string) {
    this.studentQuery.set(value);
    // Typing again after choosing a student discards that choice, so the search can be redone.
    if (this.doc.studentId) this.doc.studentId = '';
    this.showSuggest.set(true);
    this.activeIdx.set(0);
  }

  pickStudent(s: Student) {
    this.doc.studentId = s.id;
    this.studentQuery.set(`${s.firstName} ${s.lastName}${s.admissionNumber ? ' (' + s.admissionNumber + ')' : ''}`);
    this.showSuggest.set(false);
    this.saveError.set('');
  }

  clearStudent() {
    this.doc.studentId = '';
    this.studentQuery.set('');
    this.showSuggest.set(false);
  }

  hideSuggestSoon() {
    setTimeout(() => this.showSuggest.set(false), 150);
  }

  onStudentKey(e: KeyboardEvent) {
    const list = this.matches();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.showSuggest.set(true);
      this.activeIdx.set(Math.min(this.activeIdx() + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIdx.set(Math.max(this.activeIdx() - 1, 0));
    } else if (e.key === 'Enter') {
      if (this.showSuggest() && list[this.activeIdx()]) {
        e.preventDefault();
        this.pickStudent(list[this.activeIdx()]);
      }
    } else if (e.key === 'Escape') {
      this.showSuggest.set(false);
    }
  }

  /**
   * Fetches the printable document through the authenticated API client, so the request carries
   * the login token. A plain link opened in a new tab sends no token, the API answers 401, and
   * the auth interceptor signed the user out.
   */
  printDocument(d: Doc) {
    this.printError.set('');
    this.printingId.set(d.id);
    // Open the tab synchronously (inside the click) so the browser does not block it as a pop-up.
    const win = window.open('', '_blank');
    if (!win) {
      this.printingId.set(null);
      this.printError.set('Pop-up blocked — allow pop-ups for this site and try again.');
      return;
    }
    this.api.getBlob(`/documents/${d.id}/print`).subscribe({
      next: (blob) => {
        this.printingId.set(null);
        const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 90_000);
      },
      error: (err) => {
        this.printingId.set(null);
        win.close();
        this.printError.set(err?.error?.message || 'Could not open the document for printing.');
      },
    });
  }
}
