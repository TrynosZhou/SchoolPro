import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';

interface Book { id: string; isbn?: string; barcode: string; title: string; author?: string; category?: string; totalCopies: number; availableCopies: number; shelfLocation?: string }
interface Loan { id: string; bookId: string; book?: Book; borrowerType: string; borrowerName?: string; borrowerStudentId?: string; issueDate: string; dueDate: string; returnDate?: string; fineAmount: number; status: string }
interface Student { id: string; firstName: string; lastName: string }

@Component({
  selector: 'app-admin-library',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule, DecimalPipe],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="Physical Library" [navSections]="adminNav">
<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">School operations</p>
    <h2 class="wf-title">Physical Library</h2>
    <p class="wf-sub">Catalogue books, issue loans and scan returns.</p>
  </div>
  <div class="wf-stats">
    <div class="wf-stat"><strong>{{ books.length }}</strong><span>Titles</span></div>
    <div class="wf-stat"><strong>{{ loans.length }}</strong><span>Active loans</span></div>
    <div class="wf-stat"><strong>{{ overdue }}</strong><span>Overdue</span></div>
  </div>
</header>
<div class="card">
  <div class="toolbar" style="margin-bottom:1rem">
    <input class="has-search-icon" [(ngModel)]="search" (keyup.enter)="loadBooks()" placeholder="Search title/author/ISBN/barcode" />
    <button class="btn-primary" (click)="loadBooks()">Search</button>
    <button class="btn-outline" (click)="showBookForm=!showBookForm">+ Book</button>
    <button class="btn-outline" (click)="showLoanForm=!showLoanForm">Issue book</button>
    <button class="btn-outline" (click)="showReturnForm=!showReturnForm">Return (scan)</button>
  </div>

  @if (showBookForm) {
    <div class="wf-form">
      <div class="form-grid">
        <input [(ngModel)]="book.title" placeholder="Title" /><input [(ngModel)]="book.author" placeholder="Author" />
        <input [(ngModel)]="book.isbn" placeholder="ISBN" /><input [(ngModel)]="book.category" placeholder="Category" />
        <input [(ngModel)]="book.totalCopies" type="number" placeholder="Copies" /><input [(ngModel)]="book.shelfLocation" placeholder="Shelf location" />
      </div>
      <div class="toolbar" style="margin-top:.5rem"><button class="btn-primary" (click)="saveBook()">Save</button><button class="btn-outline" (click)="showBookForm=false">Cancel</button></div>
    </div>
  }

  @if (showLoanForm) {
    <div class="wf-form">
      <div class="form-grid">
        <input [(ngModel)]="loanScan" placeholder="Scan barcode or book ID" (keyup.enter)="issue()" />
        <select [(ngModel)]="loan.studentId"><option value="">Student borrower…</option>@for (s of students; track s.id) { <option [value]="s.id">{{ s.firstName }} {{ s.lastName }}</option> }</select>
        <input [(ngModel)]="loan.dueDate" type="date" title="Due date" />
        <button class="btn-primary" (click)="issue()">Issue</button>
      </div>
    </div>
  }

  @if (showReturnForm) {
    <div class="wf-form">
      <div class="form-grid">
        <input [(ngModel)]="returnScan" placeholder="Scan book barcode to return" (keyup.enter)="returnBook()" />
        <button class="btn-primary" (click)="returnBook()">Return</button>
      </div>
      @if (lastReturn) { <p class="success">Returned — fine: {{ lastReturn.fine | number:'1.2-2' }} ({{ lastReturn.overdueDays }} days late)</p> }
    </div>
  }

  <h3>Catalogue <span class="wf-count">{{ books.length }}</span></h3>
  <div class="table-scroll"><table class="data-table">
    <thead><tr><th>Barcode</th><th>Title</th><th>Author</th><th>Copies</th><th>Available</th><th>Shelf</th></tr></thead>
    <tbody>@for (b of books; track b.id) {
      <tr><td>{{ b.barcode }}</td><td>{{ b.title }}</td><td>{{ b.author || '—' }}</td><td>{{ b.totalCopies }}</td>
        <td [class.text-red]="b.availableCopies===0">{{ b.availableCopies }}</td><td>{{ b.shelfLocation || '—' }}</td></tr>
    } @empty { <tr class="wf-empty-row"><td colspan="6">No books</td></tr> }</tbody>
  </table></div>

  <h3 style="margin-top:1.5rem">Active loans <span class="wf-count">{{ loans.length }}</span></h3>
  <div class="table-scroll"><table class="data-table">
    <thead><tr><th>Book</th><th>Borrower</th><th>Issued</th><th>Due</th><th>Status</th><th>Fine</th></tr></thead>
    <tbody>@for (l of loans; track l.id) {
      <tr><td>{{ l.book?.title || l.bookId }}</td><td>{{ l.borrowerName || l.borrowerStudentId }}</td>
        <td>{{ l.issueDate }}</td><td>{{ l.dueDate }}</td>
        <td><span class="badge" [class.text-red]="l.status==='issued' && l.dueDate < today">{{ l.status }}</span></td>
        <td>{{ l.fineAmount }}</td></tr>
    } @empty { <tr class="wf-empty-row"><td colspan="6">No loans</td></tr> }</tbody>
  </table></div>
</div>
</app-portal-layout>`,
})
export class AdminLibraryComponent implements OnInit {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  books: Book[] = [];
  loans: Loan[] = [];
  students: Student[] = [];
  search = '';
  today = new Date().toISOString().slice(0, 10);
  get overdue(): number { return this.loans.filter((l) => l.status === 'issued' && l.dueDate < this.today).length; }
  showBookForm = false; showLoanForm = false; showReturnForm = false;
  book: any = { totalCopies: 1 };
  loan: any = {}; loanScan = ''; returnScan = ''; lastReturn: any = null;

  ngOnInit() {
    this.load();
    this.api.get<Student[]>('/students').subscribe({ next: (r) => (this.students = r || []), error: () => {} });
  }

  load() { this.loadBooks(); this.loadLoans(); }

  loadBooks() {
    const p: any = {};
    if (this.search) p.q = this.search;
    this.api.get<Book[]>('/library/books', p).subscribe({ next: (r) => (this.books = r || []), error: () => {} });
  }

  loadLoans() {
    this.api.get<Loan[]>('/library/loans').subscribe({ next: (r) => (this.loans = r || []), error: () => {} });
  }

  saveBook() {
    if (!this.book.title) return;
    this.api.post('/library/books', this.book).subscribe({
      next: () => { this.showBookForm = false; this.book = { totalCopies: 1 }; this.loadBooks(); }, error: () => {},
    });
  }

  issue() {
    const code = this.loanScan || this.loan.bookId;
    if (!code) return;
    this.api.post('/library/loans', { ...this.loan, bookId: code }).subscribe({
      next: () => { this.loanScan = ''; this.loan = {}; this.load(); }, error: () => {},
    });
  }

  returnBook() {
    if (!this.returnScan) return;
    this.api.post('/library/loans/return', { barcode: this.returnScan }).subscribe({
      next: (r: any) => { this.lastReturn = r; this.returnScan = ''; this.load(); },
      error: () => {},
    });
  }
}
