import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Survey {
  id: string;
  title: string;
  description?: string;
  audience: string;
  status: string;
  closesAt?: string;
  responseCount?: number;
  questions?: Question[];
  myResponse?: any;
}

interface Question {
  id: string;
  text: string;
  type: string;
  options?: any;
  minRating: number;
  maxRating: number;
  required: boolean;
  order: number;
}

const Q_TYPES = ['rating', 'text', 'single_choice', 'multi_choice'];

const Q_TYPE_LABELS: Record<string, string> = {
  rating: 'Rating',
  text: 'Written answer',
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone',
  parent: 'Parents',
  staff: 'Staff',
  student: 'Students',
};

@Component({
  selector: 'app-admin-surveys',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-surveys.component.html',
  styleUrl: './admin-surveys.component.scss',
})
export class AdminSurveysComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;
  readonly qTypes = Q_TYPES;
  readonly statusOptions = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'closed', label: 'Closed' },
  ];

  get role() { return this.auth.user()?.role || ''; }
  get isParent() { return this.role === 'parent'; }
  get isTeacher() { return this.role === 'teacher'; }
  get canManage() { return ['admin', 'principal', 'director'].includes(this.role); }

  get portalTitle() {
    return this.isParent ? 'Parent Portal' : this.isTeacher ? 'Teacher Portal' : 'Admin Portal';
  }

  surveys: Survey[] = [];
  available: Survey[] = [];
  results: any = null;
  showForm = false;
  statusFilter = '';
  survey: any = { audience: 'all', status: 'draft' };
  surveyQuestions: any[] = [];
  answers: Record<string, any> = {};
  formError = '';

  ngOnInit() {
    this.canManage ? this.load() : this.loadAvailable();
  }

  load() {
    const p: any = {};
    if (this.statusFilter) p.status = this.statusFilter;
    this.api.get<Survey[]>('/surveys', p).subscribe({ next: (r) => (this.surveys = r || []), error: () => {} });
  }

  loadAvailable() {
    this.api.get<Survey[]>('/surveys/available').subscribe({ next: (r) => (this.available = r || []), error: () => {} });
  }

  setFilter(value: string) {
    this.statusFilter = value;
    this.load();
  }

  addQuestion() {
    this.surveyQuestions.push({ text: '', type: 'rating', required: true, minRating: 1, maxRating: 5 });
  }

  cancelForm() {
    this.showForm = false;
  }

  save() {
    this.formError = '';
    if (!this.survey.title) {
      this.formError = 'Enter a title for the survey.';
      return;
    }
    const questions = this.surveyQuestions
      .filter((q) => q.text)
      .map((q) => ({
        ...q,
        options: q.options ? q.options.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
      }));
    this.api.post('/surveys', { ...this.survey, questions }).subscribe({
      next: () => {
        this.showForm = false;
        this.survey = { audience: 'all', status: 'draft' };
        this.surveyQuestions = [];
        this.load();
      },
      error: (e) => {
        this.formError = e.error?.message || 'Could not create the survey. Please try again.';
      },
    });
  }

  toggleStatus(s: Survey) {
    this.api.patch(`/surveys/${s.id}`, { status: s.status === 'published' ? 'closed' : 'published' }).subscribe({
      next: () => this.load(),
      error: () => {},
    });
  }

  viewResults(s: Survey) {
    this.api.get<any>(`/surveys/${s.id}/results`).subscribe({
      next: (r) => {
        this.results = { ...r, title: s.title };
      },
      error: () => {},
    });
  }

  typeLabel(t: string) { return Q_TYPE_LABELS[t] || t; }
  audienceLabel(a: string) { return AUDIENCE_LABELS[a] || a; }

  ratingRange(q: Question) {
    return Array.from({ length: (q.maxRating || 5) - (q.minRating || 1) + 1 }, (_, i) => i + (q.minRating || 1));
  }

  options(q: Question) { return Array.isArray(q.options) ? q.options : []; }

  submit(s: Survey) {
    const answers = (s.questions || [])
      .filter((q) => this.answers[q.id] !== undefined && this.answers[q.id] !== '')
      .map((q) => ({ questionId: q.id, answer: this.answers[q.id] }));
    this.api.post(`/surveys/${s.id}/respond`, { answers }).subscribe({
      next: () => this.loadAvailable(),
      error: () => {},
    });
  }
}
