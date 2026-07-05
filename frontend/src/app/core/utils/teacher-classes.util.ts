import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '../services/api.service';

export interface TeacherClassOption {
  id: string;
  name: string;
}

/** Classes a teacher is assigned to (subject teacher and/or class teacher). */
export function loadTeacherClassOptions(api: ApiService): Observable<TeacherClassOption[]> {
  return api
    .get<{
      assignments?: { classId: string; className: string }[];
      classTeacherOf?: { classId: string; className: string }[];
      assignedClasses?: { id: string; name: string }[];
    }>('/dashboard/teacher')
    .pipe(
      map((d) => {
        const mapById = new Map<string, TeacherClassOption>();
        for (const c of d.assignedClasses ?? []) {
          mapById.set(c.id, { id: c.id, name: c.name });
        }
        for (const a of d.assignments ?? []) {
          mapById.set(a.classId, { id: a.classId, name: a.className });
        }
        for (const c of d.classTeacherOf ?? []) {
          mapById.set(c.classId, { id: c.classId, name: c.className });
        }
        return [...mapById.values()].sort((a, b) => a.name.localeCompare(b.name));
      }),
      catchError(() => of([])),
    );
}
