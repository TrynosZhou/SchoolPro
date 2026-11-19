import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { titledName } from '../../core/utils/salutation.util';

/**
 * Lets the signed-in user say how they should be addressed (Mr / Mrs / Miss / Ms / Dr…).
 * Saved on the account, so it works even for admins who have no staff profile.
 */
@Component({
  selector: 'app-profile-title-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="ptf">
      <p class="preview">
        You will be greeted as <strong>{{ preview() || '—' }}</strong>
      </p>

      <div class="grid">
        <label class="field">
          <span>Gender</span>
          <select [ngModel]="gender()" (ngModelChange)="gender.set($event)" name="pgender">
            <option value="">— Select —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>

        @if (gender() === 'female') {
          <label class="field">
            <span>Marital status</span>
            <select [ngModel]="marital()" (ngModelChange)="marital.set($event)" name="pmarital">
              <option value="">— Select —</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
            </select>
          </label>
          @if (marital() === 'married') {
            <label class="field">
              <span>Surname used</span>
              <select [ngModel]="maiden()" (ngModelChange)="maiden.set($event)" name="pmaiden">
                <option [ngValue]="false">Husband's surname (Mrs)</option>
                <option [ngValue]="true">Maiden name (Ms)</option>
              </select>
            </label>
          }
        }

        <label class="field">
          <span>Professional title (optional)</span>
          <select [ngModel]="salutation()" (ngModelChange)="salutation.set($event)" name="psal">
            <option value="">Automatic (Mr / Mrs / Miss / Ms)</option>
            <option value="Dr">Dr</option>
            <option value="Prof">Prof</option>
            <option value="Rev">Rev</option>
            <option value="Eng">Eng</option>
            <option value="Hon">Hon</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button type="button" class="btn-primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save details' }}
        </button>
        @if (message()) { <span class="ok">{{ message() }}</span> }
        @if (error()) { <span class="err">{{ error() }}</span> }
      </div>
    </div>
  `,
  styles: [`
    .ptf { display: grid; gap: 1rem; }
    .preview { margin: 0; color: var(--color-text-secondary); }
    .preview strong { color: var(--color-text-primary); font-size: 1.05rem; }
    .grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .field { display: grid; gap: 0.35rem; }
    .field span { font-size: 0.82rem; font-weight: 600; color: var(--color-text-secondary); }
    .actions { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
    .ok { color: var(--color-positive); font-weight: 600; }
    .err { color: var(--color-negative); font-weight: 600; }
  `],
})
export class ProfileTitleFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly gender = signal('');
  readonly marital = signal('');
  readonly maiden = signal(false);
  readonly salutation = signal('');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly preview = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    return titledName({
      firstName: u.firstName,
      lastName: u.lastName,
      gender: this.gender(),
      maritalStatus: this.marital(),
      usesMaidenName: this.maiden(),
      salutation: this.salutation(),
    });
  });

  ngOnInit() {
    const u = this.auth.user();
    this.gender.set((u?.gender ?? '').toLowerCase());
    this.marital.set(u?.maritalStatus ?? '');
    this.maiden.set(!!u?.usesMaidenName);
    this.salutation.set(u?.salutation ?? '');
  }

  save() {
    this.saving.set(true);
    this.message.set('');
    this.error.set('');
    const female = this.gender() === 'female';
    this.api
      .patch<{ gender: string | null; maritalStatus: string | null; usesMaidenName: boolean; salutation: string | null }>('/auth/me', {
        gender: this.gender() || null,
        maritalStatus: female ? this.marital() || null : null,
        usesMaidenName: female && this.marital() === 'married' ? this.maiden() : false,
        salutation: this.salutation() || null,
      })
      .subscribe({
        next: (res) => {
          this.auth.patchUser({
            gender: res.gender,
            maritalStatus: res.maritalStatus,
            usesMaidenName: res.usesMaidenName,
            salutation: res.salutation,
          });
          this.saving.set(false);
          this.message.set('Saved. Your greeting has been updated.');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'Could not save your details.');
        },
      });
  }
}
