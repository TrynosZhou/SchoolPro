import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalLayoutComponent } from '../../shared/portal-layout/portal-layout.component';
import { ADMIN_NAV_SECTIONS } from '../../core/config/admin-nav';
import { ApiService } from '../../core/services/api.service';
import { formatTeacherTimetableName } from '../../core/utils/teacher-display';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'teacher' | 'admin' | 'principal';
  isActive: boolean;
}

interface StaffMember {
  id: string;
  employeeNumber: string;
  userId: string;
  title?: string | null;
  department?: string;
  isActive: boolean;
  user: StaffUser;
}

interface StaffAttendanceRow {
  staffId: string;
  date: string;
  status: AttendanceStatus;
}

@Component({
  selector: 'app-admin-staff-attendance',
  standalone: true,
  imports: [PortalLayoutComponent, FormsModule],
  templateUrl: './admin-staff-attendance.component.html',
  styleUrl: './admin-staff-attendance.component.scss',
})
export class AdminStaffAttendanceComponent implements OnInit {
  private api = inject(ApiService);

  readonly adminNav = ADMIN_NAV_SECTIONS;
  readonly attendanceStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

  staff = signal<StaffMember[]>([]);
  loading = signal(true);
  submitting = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  attendanceDate = new Date().toISOString().split('T')[0];
  attendanceMarks = signal<Record<string, AttendanceStatus>>({});
  attendanceSearch = signal('');

  activeStaff = computed(() => this.staff().filter((s) => s.isActive));

  filteredAttendanceStaff = computed(() => {
    const q = this.attendanceSearch().toLowerCase().trim();
    const list = this.activeStaff();
    if (!q) return list;
    return list.filter((s) =>
      `${s.user.firstName} ${s.user.lastName} ${s.employeeNumber} ${s.department}`.toLowerCase().includes(q),
    );
  });

  attendanceStats = computed(() => {
    const marks = this.attendanceMarks();
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const s of this.activeStaff()) {
      const st = marks[s.id] || 'present';
      counts[st] += 1;
    }
    return { ...counts, total: this.activeStaff().length };
  });

  ngOnInit(): void {
    this.loadStaff();
  }

  loadStaff(): void {
    this.loading.set(true);
    this.api.get<StaffMember[]>('/admin/staff', { status: 'active' }).subscribe({
      next: (list) => {
        this.staff.set(list);
        this.loading.set(false);
        this.initAttendanceMarks();
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Failed to load staff');
      },
    });
  }

  initAttendanceMarks(): void {
    const marks: Record<string, AttendanceStatus> = {};
    for (const s of this.activeStaff()) {
      marks[s.id] = 'present';
    }
    this.attendanceMarks.set(marks);
    this.loadAttendanceForDate();
  }

  loadAttendanceForDate(): void {
    this.api.get<StaffAttendanceRow[]>('/attendance/staff', { date: this.attendanceDate }).subscribe({
      next: (records) => {
        const marks = { ...this.attendanceMarks() };
        for (const r of records) {
          marks[r.staffId] = r.status;
        }
        this.attendanceMarks.set(marks);
      },
    });
  }

  setAttendance(staffId: string, status: AttendanceStatus): void {
    this.attendanceMarks.set({ ...this.attendanceMarks(), [staffId]: status });
  }

  markAllAttendance(status: AttendanceStatus): void {
    const marks = { ...this.attendanceMarks() };
    for (const s of this.activeStaff()) {
      marks[s.id] = status;
    }
    this.attendanceMarks.set(marks);
  }

  saveAttendance(): void {
    const records = this.activeStaff().map((s) => ({
      staffId: s.id,
      status: this.attendanceMarks()[s.id] || 'present',
    }));
    this.submitting.set(true);
    this.api.post('/attendance/staff/bulk', { date: this.attendanceDate, records }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showToast('success', `Attendance saved for ${this.attendanceDate}`);
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('error', 'Failed to save attendance');
      },
    });
  }

  directoryName(s: StaffMember): string {
    return formatTeacherTimetableName({
      title: s.title,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
    });
  }

  initials(s: StaffMember): string {
    return `${(s.user.firstName || '').charAt(0)}${(s.user.lastName || '').charAt(0)}`.toUpperCase() || '?';
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      teacher: 'Teacher',
      admin: 'Administrator',
      principal: 'Principal',
    };
    return map[role] || role;
  }

  attendanceLabel(status: AttendanceStatus): string {
    const map: Record<AttendanceStatus, string> = {
      present: 'Present',
      late: 'Late',
      absent: 'Absent',
      excused: 'Excused',
    };
    return map[status];
  }

  private showToast(type: 'success' | 'error', msg: string): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4500);
  }
}
