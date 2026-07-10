import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

const TOUR_KEY = 'school_pro_demo_tour_dismissed';

interface TourStep {
  id: string;
  label: string;
  hint: string;
}

const TOUR_STEPS: TourStep[] = [
  { id: 'explore', label: 'Explore each role', hint: 'Use the demo landing page to sign in as admin, teacher, parent, student, or accountant.' },
  { id: 'fees', label: 'Review finance', hint: 'Open Manage Fees to see invoices, payments, and varied fee statuses.' },
  { id: 'academics', label: 'Check academics', hint: 'Browse attendance, marks, and timetables seeded for two terms.' },
  { id: 'limits', label: 'Know the limits', hint: 'Destructive actions, exports, and billing changes are disabled in demo mode.' },
];

@Component({
  selector: 'app-demo-onboarding-tour',
  standalone: true,
  template: `
    @if (open()) {
      <div class="tour-backdrop" (click)="dismiss()">
        <div class="tour-card" role="dialog" aria-labelledby="demo-tour-title" (click)="$event.stopPropagation()">
          <header>
            <span class="tour-badge">Quick tour</span>
            <h2 id="demo-tour-title">Welcome to the School Pro demo</h2>
            <p>Sample data is pre-loaded so you can click around safely.</p>
          </header>

          <ol class="tour-steps">
            @for (step of steps; track step.id; let i = $index) {
              <li>
                <span class="step-num">{{ i + 1 }}</span>
                <div>
                  <strong>{{ step.label }}</strong>
                  <p>{{ step.hint }}</p>
                </div>
              </li>
            }
          </ol>

          <footer>
            <button type="button" class="btn-secondary" (click)="dismiss()">Got it</button>
            <button type="button" class="btn-primary" (click)="goToPortal()">Start exploring</button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .tour-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1300;
      background: rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .tour-card {
      width: min(520px, 100%);
      background: #fff;
      border-radius: 16px;
      padding: 1.35rem 1.5rem 1.25rem;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
    }

    header h2 {
      margin: 0.35rem 0 0.25rem;
      font-size: 1.35rem;
      color: #0f172a;
    }

    header p {
      margin: 0;
      color: #64748b;
      font-size: 0.92rem;
    }

    .tour-badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .tour-steps {
      list-style: none;
      margin: 1.1rem 0 1.25rem;
      padding: 0;
      display: grid;
      gap: 0.85rem;
    }

    .tour-steps li {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .step-num {
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 999px;
      background: #eff6ff;
      color: #2563eb;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .tour-steps strong {
      display: block;
      color: #0f172a;
      font-size: 0.92rem;
    }

    .tour-steps p {
      margin: 0.15rem 0 0;
      color: #64748b;
      font-size: 0.84rem;
      line-height: 1.4;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.6rem;
    }

    .btn-secondary,
    .btn-primary {
      border-radius: 8px;
      padding: 0.55rem 0.95rem;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }

    .btn-secondary {
      background: #f8fafc;
      border-color: #e2e8f0;
      color: #334155;
    }

    .btn-primary {
      background: #2563eb;
      color: #fff;
    }
  `],
})
export class DemoOnboardingTourComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly steps = TOUR_STEPS;
  readonly open = signal(false);

  ngOnInit(): void {
    if (!this.auth.isDemoSession()) return;
    if (sessionStorage.getItem(TOUR_KEY) === '1') return;
    this.open.set(true);
  }

  dismiss(): void {
    sessionStorage.setItem(TOUR_KEY, '1');
    this.open.set(false);
  }

  goToPortal(): void {
    this.dismiss();
    void this.router.navigate([this.auth.getPortalRoute()]);
  }
}
