import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PARENT_NAV_ITEMS } from '../../core/config/parent-nav';

interface ParentChildSummary {
  linkId?: string;
  relationship?: string;
  student: {
    id: string;
    admissionNumber?: string;
    firstName: string;
    lastName: string;
    className?: string;
    formName?: string;
  };
  balanceOwed: number;
  recentAssessments: { topic: string; score?: number; maxScore?: number; weekStart: string }[];
  attendance: { status: string; count: string }[];
}

@Component({
  selector: 'app-parent-dashboard',
  standalone: true,
  imports: [PortalLayoutComponent, DecimalPipe, RouterLink, FormsModule],
  templateUrl: './parent-dashboard.component.html',
  styleUrl: './parent-dashboard.component.scss',
})
export class ParentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  children = signal<ParentChildSummary[]>([]);
  loading = signal(true);
  linking = signal(false);
  showLinkForm = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  linkForm = {
    admissionNumber: '',
    relationship: 'Parent',
  };

  readonly nav = PARENT_NAV_ITEMS;

  childCount = computed(() => this.children().length);

  isParent = computed(() => this.auth.user()?.role === 'parent');

  ngOnInit() {
    this.loadChildren();
  }

  loadChildren() {
    this.loading.set(true);
    this.api.get<ParentChildSummary[]>('/dashboard/parent').subscribe({
      next: (d) => {
        this.children.set(d);
        this.loading.set(false);
        if (!d.length && this.isParent()) {
          this.showLinkForm.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Could not load linked children');
      },
    });
  }

  toggleLinkForm() {
    this.showLinkForm.update((v) => !v);
  }

  linkChild() {
    if (!this.linkForm.admissionNumber.trim()) {
      this.showToast('error', 'Enter your child\'s Student ID');
      return;
    }

    this.linking.set(true);
    this.api.post<{ message: string }>('/students/parent/link-child', {
      admissionNumber: this.linkForm.admissionNumber.trim().toUpperCase(),
      relationship: this.linkForm.relationship,
    }).subscribe({
      next: (res) => {
        this.linking.set(false);
        this.linkForm = { admissionNumber: '', relationship: 'Parent' };
        this.showLinkForm.set(true);
        this.showToast('success', res.message || 'Child linked. Add another Student ID or close this form.');
        this.loadChildren();
      },
      error: (e) => {
        this.linking.set(false);
        this.showToast('error', e.error?.message || 'Could not link child');
      },
    });
  }

  classLabel(child: ParentChildSummary): string {
    const parts = [child.student.formName, child.student.className].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Not enrolled in a class';
  }

  attendanceSummary(child: ParentChildSummary): string {
    const present = child.attendance.find((a) => a.status === 'present')?.count;
    if (present) return `${present} present (30 days)`;
    if (child.attendance.length) {
      return child.attendance.map((a) => `${a.status}: ${a.count}`).join(', ');
    }
    return 'No attendance records yet';
  }

  private showToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
