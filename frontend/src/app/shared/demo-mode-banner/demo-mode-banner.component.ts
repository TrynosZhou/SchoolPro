import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-demo-mode-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (auth.isDemoSession()) {
      <div class="demo-banner" role="status">
        <div class="demo-banner-inner">
          <span class="demo-pill">Demo mode</span>
          <p>
            You are exploring sample data. Changes are limited and reset on a schedule — nothing here affects a real school.
          </p>
          <a routerLink="/demo" class="demo-link">Switch role</a>
          <button type="button" class="demo-exit" (click)="auth.logout()">Exit demo</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .demo-banner {
      position: sticky;
      top: 0;
      z-index: 1200;
      background: linear-gradient(90deg, #1e3a8a, #2563eb);
      color: #eff6ff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
    }

    .demo-banner-inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem 1rem;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0.55rem 1.25rem;
      font-size: 0.86rem;
    }

    .demo-pill {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      flex: 1 1 220px;
      line-height: 1.35;
    }

    .demo-link,
    .demo-exit {
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border-radius: 8px;
      padding: 0.35rem 0.75rem;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
    }

    .demo-link:hover,
    .demo-exit:hover {
      background: rgba(255, 255, 255, 0.18);
    }
  `],
})
export class DemoModeBannerComponent {
  readonly auth = inject(AuthService);
}
