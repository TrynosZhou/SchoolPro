import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  APPLICATION_STAGES,
  APPLICATION_STATUS_LABELS,
  ApplicationTracking,
} from '../../core/models/admission';

@Component({
  selector: 'app-application-status',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './application-status.component.html',
  styleUrl: './application-status.component.scss',
})
export class ApplicationStatusComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly currentYear = new Date().getFullYear();
  readonly stages = APPLICATION_STAGES;
  readonly statusLabels = APPLICATION_STATUS_LABELS;

  reference = '';
  contact = '';

  loading = signal(false);
  error = signal('');
  result = signal<ApplicationTracking | null>(null);

  isRejected = computed(() => this.result()?.status === 'rejected');

  /** Index of the current stage within the linear pipeline (applied→shortlisted→admitted). */
  activeStageIndex = computed(() => {
    const status = this.result()?.status;
    if (!status || status === 'rejected') return -1;
    return this.stages.findIndex((s) => s.key === status);
  });

  ngOnInit(): void {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref) this.reference = ref;
  }

  track(): void {
    this.error.set('');
    this.result.set(null);
    const reference = this.reference.trim();
    const contact = this.contact.trim();
    if (!reference || !contact) {
      this.error.set('Enter your application reference number and email or phone.');
      return;
    }

    this.loading.set(true);
    this.api
      .get<ApplicationTracking>('/admissions/track', { reference, contact })
      .subscribe({
        next: (res) => {
          this.result.set(res);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(
            e.error?.message || 'No application found for that reference number and contact detail.',
          );
          this.loading.set(false);
        },
      });
  }

  statusLabel(status: string): string {
    return this.statusLabels[status as keyof typeof this.statusLabels] ?? status;
  }
}
