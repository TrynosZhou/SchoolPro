import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { TEACHER_NAV_SECTIONS } from '../../core/config/teacher-nav';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Survey { id: string; title: string; description?: string; audience: string; status: string; closesAt?: string; responseCount?: number; questions?: Question[]; myResponse?: any }
interface Question { id: string; text: string; type: string; options?: any; minRating: number; maxRating: number; required: boolean; order: number }

const Q_TYPES = ['rating', 'text', 'single_choice', 'multi_choice'];

@Component({
  selector: 'app-admin-surveys',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout [portalTitle]="isParent?'Parent Portal':isTeacher?'Teacher Portal':'Admin Portal'" pageTitle="Surveys & Feedback" [navSections]="isParent||isTeacher?[]:adminNav" [navItems]="isParent?parentNav:[]">
<div class="card">
  @if (canManage) {
    <div class="toolbar" style="margin-bottom:1rem">
      <select [(ngModel)]="statusFilter" (change)="load()"><option value="">All</option><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select>
      <button class="btn-primary" (click)="showForm=!showForm">+ New survey</button>
    </div>
    @if (showForm) {
      <div class="card" style="margin-bottom:1rem">
        <div class="form-grid">
          <input [(ngModel)]="survey.title" placeholder="Title *" /><input [(ngModel)]="survey.description" placeholder="Description" />
          <select [(ngModel)]="survey.audience"><option value="all">Everyone</option><option value="parent">Parents</option><option value="staff">Staff</option><option value="student">Students</option></select>
          <input [(ngModel)]="survey.closesAt" type="date" title="Closes at" />
          <select [(ngModel)]="survey.status"><option value="draft">Draft</option><option value="published">Published</option></select>
        </div>
        <h4>Questions</h4>
        @for (q of surveyQuestions; track $index) {
          <div class="form-grid" style="margin-bottom:.5rem">
            <input [(ngModel)]="q.text" placeholder="Question" />
            <select [(ngModel)]="q.type">@for (t of qTypes; track t) { <option [value]="t">{{ t.replace('_',' ') }}</option> }</select>
            <input [(ngModel)]="q.options" placeholder="Options (comma-separated)" />
            <label><input type="checkbox" [(ngModel)]="q.required" [checked]="true" /> Required</label>
          </div>
        }
        <div class="toolbar">
          <button class="btn-outline" (click)="surveyQuestions.push({text:'',type:'rating',required:true,minRating:1,maxRating:5})">+ Question</button>
          <button class="btn-primary" (click)="save()">Create</button>
          <button class="btn-outline" (click)="showForm=false">Cancel</button>
        </div>
      </div>
    }
    <table class="data-table"><thead><tr><th>Title</th><th>Audience</th><th>Status</th><th>Responses</th><th>Closes</th><th></th></tr></thead><tbody>
      @for (s of surveys; track s.id) {
        <tr><td>{{ s.title }}</td><td>{{ s.audience }}</td><td><span class="badge">{{ s.status }}</span></td>
          <td>{{ s.responseCount || 0 }}</td><td>{{ s.closesAt || '—' }}</td>
          <td><button class="btn-outline" (click)="viewResults(s)">Results</button>
            <button class="btn-outline" (click)="toggleStatus(s)">{{ s.status==='published'?'Close':'Publish' }}</button></td></tr>
      } @empty { <tr><td colspan="6">No surveys</td></tr> }
    </tbody></table>
    @if (results) {
      <div class="card" style="margin-top:1rem"><h3>Results — {{ results.title }} ({{ results.totalResponses }} responses)</h3>
        @for (q of results.questions; track q.question.id) {
          <div style="margin:.5rem 0"><b>{{ q.question.text }}</b>
            @if (q.average != null) { <span> avg {{ q.average }}/5 ({{ q.count }} answers)</span> }
            @for (d of q.distribution || []; track d.value) { <span class="badge" style="margin-left:.3rem">{{ d.value }}: {{ d.count }}</span> }
            @if (q.answers) { @for (a of q.answers.slice(0,5); track $index) { <div style="font-size:.85rem;color:#555">“{{ a }}”</div> } }
          </div>
        }
      </div>
    }
  } @else {
    <h3>Surveys</h3>
    @for (s of available; track s.id) {
      <div class="card" style="margin-bottom:.75rem">
        <b>{{ s.title }}</b> @if (s.description) { <div style="color:#555">{{ s.description }}</div> }
        @if (s.myResponse) { <p class="success">You responded — thank you.</p> }
        @else {
          @for (q of s.questions; track q.id) {
            <div style="margin:.5rem 0">
              <div>{{ q.text }} @if (q.required) { <span class="text-red">*</span> }</div>
              @if (q.type==='rating') {
                <div class="toolbar">@for (n of ratingRange(q); track n) {
                  <button class="btn-outline" [style.fontWeight]="answers[q.id]===n?'700':'400'" (click)="answers[q.id]=n">{{ n }}</button>
                }</div>
              } @else if (q.type==='single_choice') {
                <select [(ngModel)]="answers[q.id]"><option value="">Choose…</option>@for (o of options(q); track o) { <option [value]="o">{{ o }}</option> }</select>
              } @else {
                <textarea [(ngModel)]="answers[q.id]" rows="2" style="width:100%"></textarea>
              }
            </div>
          }
          <button class="btn-primary" (click)="submit(s)">Submit</button>
        }
      </div>
    } @empty { <p>No surveys available.</p> }
  }
</div>
</app-portal-layout>`,
})
export class AdminSurveysComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly teacherNav = TEACHER_NAV_SECTIONS;
  readonly parentNav = PARENT_NAV_ITEMS;
  readonly qTypes = Q_TYPES;

  get role() { return this.auth.user()?.role || ''; }
  get isParent() { return this.role === 'parent'; }
  get isTeacher() { return this.role === 'teacher'; }
  get canManage() { return ['admin', 'principal', 'director'].includes(this.role); }

  surveys: Survey[] = [];
  available: Survey[] = [];
  results: any = null;
  showForm = false;
  statusFilter = '';
  survey: any = { audience: 'all', status: 'draft' };
  surveyQuestions: any[] = [];
  answers: Record<string, any> = {};

  ngOnInit() { this.canManage ? this.load() : this.loadAvailable(); }

  load() {
    const p: any = {};
    if (this.statusFilter) p.status = this.statusFilter;
    this.api.get<Survey[]>('/surveys', p).subscribe({ next: (r) => (this.surveys = r || []), error: () => {} });
  }

  loadAvailable() {
    this.api.get<Survey[]>('/surveys/available').subscribe({ next: (r) => (this.available = r || []), error: () => {} });
  }

  save() {
    if (!this.survey.title) return;
    const questions = this.surveyQuestions.filter((q) => q.text).map((q, i) => ({
      ...q,
      options: q.options ? q.options.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
    }));
    this.api.post('/surveys', { ...this.survey, questions }).subscribe({
      next: () => { this.showForm = false; this.survey = { audience: 'all', status: 'draft' }; this.surveyQuestions = []; this.load(); },
      error: () => {},
    });
  }

  toggleStatus(s: Survey) {
    this.api.patch(`/surveys/${s.id}`, { status: s.status === 'published' ? 'closed' : 'published' }).subscribe({
      next: () => this.load(), error: () => {},
    });
  }

  viewResults(s: Survey) {
    this.api.get<any>(`/surveys/${s.id}/results`).subscribe({
      next: (r) => { this.results = { ...r, title: s.title }; }, error: () => {},
    });
  }

  ratingRange(q: Question) { return Array.from({ length: (q.maxRating || 5) - (q.minRating || 1) + 1 }, (_, i) => i + (q.minRating || 1)); }
  options(q: Question) { return Array.isArray(q.options) ? q.options : []; }

  submit(s: Survey) {
    const answers = (s.questions || [])
      .filter((q) => this.answers[q.id] !== undefined && this.answers[q.id] !== '')
      .map((q) => ({ questionId: q.id, answer: this.answers[q.id] }));
    this.api.post(`/surveys/${s.id}/respond`, { answers }).subscribe({
      next: () => this.loadAvailable(), error: () => {},
    });
  }
}
