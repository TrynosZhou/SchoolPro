import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  ClassRoster,
  TeacherAssignment,
  TeacherWeeklySchedule,
  TimetableSlot,
  WorkloadSummaryRow,
  SectionOption,
} from '../models/teacher-assignment';

@Injectable({ providedIn: 'root' })
export class TeacherAssignmentService {
  private api = inject(ApiService);
  private base = '/admin/assignments';

  list(params?: Record<string, string>) {
    return this.api.get<TeacherAssignment[]>(this.base, params);
  }

  create(body: unknown) {
    return this.api.post<TeacherAssignment>(this.base, body);
  }

  bulkCreate(body: unknown) {
    return this.api.post<TeacherAssignment[]>(`${this.base}/bulk`, body);
  }

  update(id: string, body: unknown) {
    return this.api.patch<TeacherAssignment>(`${this.base}/${id}`, body);
  }

  end(id: string, endDate?: string) {
    return this.api.post<TeacherAssignment>(`${this.base}/${id}/end`, endDate ? { endDate } : {});
  }

  resetTeacher(teacherId: string, confirmText: string) {
    return this.api.post<{ ended: number }>(`${this.base}/teacher/${teacherId}/reset`, { confirmText });
  }

  resetAll(confirmText: string) {
    return this.api.post<{ ended: number }>(`${this.base}/reset-all`, { confirmText });
  }

  syncTeacherLoad() {
    return this.api.post<{ synced: number }>(`${this.base}/sync-teacher-load`, {});
  }

  workloadSummary() {
    return this.api.get<WorkloadSummaryRow[]>(`${this.base}/workload/summary`);
  }

  classRoster(classId: string, sectionId?: string) {
    const params: Record<string, string> = {};
    if (sectionId) params['sectionId'] = sectionId;
    return this.api.get<ClassRoster>(`${this.base}/class-roster/${classId}`, params);
  }

  teacherSchedule(teacherId: string) {
    return this.api.get<TeacherWeeklySchedule>(`${this.base}/teacher-schedule/${teacherId}`);
  }

  createSlot(body: unknown) {
    return this.api.post<TimetableSlot>(`${this.base}/timetable-slots`, body);
  }

  updateSlot(id: string, body: unknown) {
    return this.api.patch<TimetableSlot>(`${this.base}/timetable-slots/${id}`, body);
  }

  deleteSlot(id: string) {
    return this.api.delete<void>(`${this.base}/timetable-slots/${id}`);
  }

  listSections(formId?: string) {
    const params: Record<string, string> = {};
    if (formId) params['formId'] = formId;
    return this.api.get<SectionOption[]>(`${this.base}/sections`, params);
  }
}
