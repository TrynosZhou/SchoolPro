import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';
import { buildIdCardPrintDocument, openIdCardPrintWindow } from '../../core/utils/id-card-print.util';

interface Student { id: string; firstName: string; lastName: string; admissionNumber?: string; photoUrl?: string; dateOfBirth?: string; gender?: string; className?: string; formName?: string; schoolClass?: { name?: string }; form?: { name?: string } }
interface CardInfo { card: { code: string; qrDataUrl: string }; student: Student }
interface Scan { id: string; studentId: string; studentName?: string; date: string; time: string; direction: string }

@Component({
  selector: 'app-admin-id-cards',
  standalone: true,
  styleUrls: ['./welfare-classic.scss'],
  imports: [PortalLayoutComponent, FormsModule],
  template: `
<app-portal-layout portalTitle="Admin Portal" pageTitle="ID Cards & QR Attendance" [navSections]="adminNav">
<header class="wf-head">
  <div class="wf-head-copy">
    <p class="wf-eyebrow">Modern tools</p>
    <h2 class="wf-title">ID Cards &amp; QR Attendance</h2>
    <p class="wf-sub">Issue student ID cards and record arrivals and departures by scanning QR codes.</p>
  </div>
  <div class="wf-stats">
    <div class="wf-stat"><strong>{{ scans.length }}</strong><span>Recent scans</span></div>
  </div>
</header>
<div class="grid-2">
  <div class="card">
    <h3>Student ID card</h3>
    <div class="toolbar">
      <input class="has-search-icon" type="text" [(ngModel)]="searchText" placeholder="Name or student ID" (keyup.enter)="loadCard()" style="min-width:16rem" />
      <button class="btn-primary" (click)="loadCard()" [disabled]="!searchText.trim() || loadingCard">{{ loadingCard ? 'Loading…' : 'Load' }}</button>
      <button class="btn-outline" (click)="ensureAll()" [disabled]="ensuring()">{{ ensuring() ? 'Generating…' : 'Ensure all cards' }}</button>
      @if (ensureMsg) { <span class="badge" [class.text-green]="!ensureError">{{ ensureMsg }}</span> }
    </div>
    @if (cardError) { <p class="error" style="margin-top:.75rem">{{ cardError }}</p> }
    @if (matches.length > 1) {
      <div style="margin-top:.75rem">
        <p style="margin:0 0 .4rem">Choose a student:</p>
        @for (m of matches; track m.id) {
          <button class="btn-outline" style="display:block;width:100%;text-align:left;margin-bottom:.35rem" (click)="pickMatch(m)">
            {{ m.firstName }} {{ m.lastName }} ({{ m.admissionNumber }})
          </button>
        }
      </div>
    }
    @if (card) {
      <div style="display:flex;flex-direction:column;align-items:center;margin-top:1rem">
        <div class="id-card" style="width:340px;height:214px;border-radius:10px;overflow:hidden;position:relative;display:flex;flex-direction:column;background:#fff;color:#1e293b;border:2px solid #1a3a6b;box-shadow:0 4px 14px rgba(0,0,0,.2)">
          <div style="background:linear-gradient(90deg,#1a3a6b,#2563eb);color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
            <b style="font-size:12px;letter-spacing:.4px">School Pro Academy</b>
            <span style="font-size:8px;opacity:.85;letter-spacing:1px;text-transform:uppercase">Student ID</span>
          </div>
          <div style="flex:1;display:flex;padding:10px 12px;gap:12px;min-height:0">
            <div style="width:78px;height:100px;flex:0 0 78px;border:1px solid #cbd5e1;border-radius:5px;overflow:hidden;background:#e2e8f0;display:flex;align-items:center;justify-content:center">
              @if (photoSrc()) { <img [src]="photoSrc()" style="width:100%;height:100%;object-fit:cover;object-position:top" /> }
              @else { <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="#94a3b8" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg> }
            </div>
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-start;padding-top:2px">
              <div class="id-name" style="font-size:14px;font-weight:800;color:#1a3a6b;line-height:1.2;margin-bottom:5px;word-break:break-word;overflow-wrap:anywhere">{{ card.student.firstName }} {{ card.student.lastName }}</div>
              <table style="width:100%;font-size:9.5px;border-collapse:collapse">
                <tr><td style="color:#64748b;width:34%;padding:1px 0;white-space:nowrap">Adm. No.</td><td style="font-weight:600">{{ card.student.admissionNumber || '—' }}</td></tr>
                <tr><td style="color:#64748b;padding:1px 0">Class</td><td style="font-weight:600">{{ classLabel() }}</td></tr>
                <tr><td style="color:#64748b;padding:1px 0">Date of Birth</td><td style="font-weight:600">{{ card.student.dateOfBirth || '—' }}</td></tr>
                @if (card.student.gender) { <tr><td style="color:#64748b;padding:1px 0">Gender</td><td style="font-weight:600">{{ card.student.gender }}</td></tr> }
              </table>
            </div>
            <div style="flex:0 0 84px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
              <img [src]="card.card.qrDataUrl" style="width:72px;height:72px" />
              <div style="font-family:monospace;font-size:10px;font-weight:700;color:#1e293b;letter-spacing:0;white-space:nowrap">{{ card.card.code }}</div>
            </div>
          </div>
          <div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:4px 12px;display:flex;justify-content:space-between;font-size:8px;color:#64748b">
            <span>Verify at /verify</span><span>ID-{{ card.card.code.slice(0, 8) }}</span>
          </div>
        </div>
        <div class="toolbar" style="justify-content:center;margin-top:.75rem;width:100%">
          <button type="button" class="btn-primary" (click)="printCard()">Print card</button>
          @if (printError) { <span class="wf-pill">{{ printError }}</span> }
        </div>
      </div>
    }
  </div>

  <div class="card">
    <h3>QR scan attendance</h3>
    <div class="toolbar">
      <select [(ngModel)]="direction"><option value="arrival">Arrival</option><option value="departure">Departure</option></select>
      <input [(ngModel)]="scanCode" placeholder="Scan / enter code" (keyup.enter)="scan()" />
      <button class="btn-primary" (click)="scan()">Record</button>
    </div>
    @if (lastScan) { <p class="success">{{ lastScan.student.name }} — {{ lastScan.scan.direction }} at {{ lastScan.scan.time }}</p> }
    @if (scanError) { <p class="error">{{ scanError }}</p> }

    <div class="toolbar" style="justify-content:space-between;margin-top:1rem"><h3 style="margin:0">Recent scans</h3><button class="btn-outline" (click)="loadScans()">Refresh</button></div>
    @if (scansError) { <p class="error">{{ scansError }}</p> }
    <table class="data-table"><thead><tr><th>Time</th><th>Student</th><th>Direction</th></tr></thead><tbody>
      @for (s of scans; track s.id) { <tr><td>{{ s.date }} {{ s.time }}</td><td>{{ s.studentName }}</td><td><span class="wf-pill">{{ s.direction }}</span></td></tr> }
      @empty { <tr class="wf-empty-row"><td colspan="3">No scans yet</td></tr> }
    </tbody></table>
  </div>
</div>
</app-portal-layout>`,
})
export class AdminIdCardsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  readonly adminNav = ADMIN_NAV_SECTIONS;

  card: CardInfo | null = null;
  direction = 'arrival';
  scanCode = '';
  lastScan: any = null;
  scanError = '';
  scans: Scan[] = [];

  private scansTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadScans();
    // Refresh the list so scans recorded from other screens or devices appear without a page reload.
    this.scansTimer = setInterval(() => this.loadScans(), 15000);
  }

  ngOnDestroy() {
    if (this.scansTimer) clearInterval(this.scansTimer);
  }

  cardError = '';
  loadingCard = false;
  searchText = '';
  matches: Student[] = [];

  /** Looks up students by name or student ID, then loads the card when exactly one matches. */
  loadCard() {
    const q = this.searchText.trim();
    if (!q) return;
    this.loadingCard = true;
    this.cardError = '';
    this.matches = [];
    this.card = null;
    this.api.get<Student[]>('/id-cards/search', { q }).subscribe({
      next: (rows) => {
        if (!rows.length) {
          this.loadingCard = false;
          this.cardError = `No student matches “${q}”.`;
        } else if (rows.length === 1) {
          this.fetchCard(rows[0].id);
        } else {
          this.loadingCard = false;
          this.matches = rows;
          this.cardError = `${rows.length} students match “${q}”. Choose one below (type more to narrow it).`;
        }
      },
      error: (e) => {
        this.loadingCard = false;
        this.cardError = e?.error?.message || 'Search failed. Please try again.';
      },
    });
  }

  pickMatch(s: Student) {
    this.matches = [];
    this.cardError = '';
    this.fetchCard(s.id);
  }

  private fetchCard(studentId: string) {
    this.loadingCard = true;
    this.api.get<CardInfo>(`/id-cards/${studentId}/card`).subscribe({
      next: (r) => {
        this.card = r;
        this.loadingCard = false;
      },
      error: (e) => {
        this.card = null;
        this.loadingCard = false;
        this.cardError = e?.error?.message || 'Could not load the ID card. Please try again.';
      },
    });
  }

  classLabel(): string {
    const s = this.card?.student;
    // GET /id-cards/:id/card returns className/formName; keep the nested shape as a fallback.
    const cls = s?.className || s?.schoolClass?.name || '—';
    const form = s?.formName || s?.form?.name;
    return form ? `${cls} ${form}` : cls;
  }

  photoSrc(): string {
    const url = this.card?.student?.photoUrl;
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = (environment.apiUrl || '').replace(/\/api\/?$/, '');
    return base + url;
  }

  printError = '';

  /**
   * Opens a print preview built from the card already loaded on screen. This deliberately avoids
   * navigating to /api/id-cards/:id/print: a link/new tab sends no Authorization header, so the
   * API answered 401 and the auth interceptor signed the user out.
   */
  printCard() {
    const c = this.card;
    if (!c) return;
    this.printError = '';
    const html = buildIdCardPrintDocument({
      firstName: c.student.firstName,
      lastName: c.student.lastName,
      admissionNumber: c.student.admissionNumber,
      classLabel: this.classLabel(),
      dateOfBirth: c.student.dateOfBirth,
      gender: c.student.gender,
      photoUrl: this.photoSrc(),
      qrDataUrl: c.card.qrDataUrl,
      code: c.card.code,
    });
    if (!openIdCardPrintWindow(html)) {
      this.printError = 'Pop-up blocked — allow pop-ups for this site and try again.';
    }
  }

  ensuring = signal(false);
  ensureMsg = '';
  ensureError = false;

  ensureAll() {
    this.ensuring.set(true);
    this.ensureMsg = '';
    this.ensureError = false;
    this.api.post<{ created: number; total: number }>('/id-cards/ensure-all', {}).subscribe({
      next: (r) => {
        this.ensuring.set(false);
        this.ensureMsg = r.created > 0
          ? `Generated ${r.created} new card${r.created > 1 ? 's' : ''} (${r.total} students total)`
          : `All ${r.total} students already have ID cards`;
      },
      error: () => {
        this.ensuring.set(false);
        this.ensureMsg = 'Failed to generate cards';
        this.ensureError = true;
      },
    });
  }

  scan() {
    if (!this.scanCode) return;
    this.scanError = '';
    this.api.post<any>('/id-cards/scan', { code: this.scanCode, direction: this.direction }).subscribe({
      next: (r) => { this.lastScan = r; this.scanCode = ''; this.loadScans(); },
      error: (e) => { this.scanError = e?.error?.message || 'Scan failed'; },
    });
  }

  scansError = '';

  loadScans() {
    this.api.get<Scan[]>('/id-cards/scans', { limit: '50' }).subscribe({
      next: (r) => {
        this.scans = r || [];
        this.scansError = '';
      },
      error: (e) => {
        this.scansError = e?.error?.message || 'Could not load recent scans.';
      },
    });
  }
}
