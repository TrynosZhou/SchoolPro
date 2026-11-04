import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export type LmsAssignmentStatus = 'draft' | 'published' | 'closed';
export type LmsSubmissionStatus = 'submitted' | 'late' | 'graded' | 'returned';
export type LessonContentType = 'video' | 'note' | 'link' | 'document' | 'other';
export type LibraryResourceType = 'book' | 'pdf' | 'video' | 'audio' | 'link' | 'other';
export type VirtualClassStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface LmsAssignment {
  id: string;
  classId: string;
  subjectId?: string;
  termId?: string;
  teacherId: string;
  title: string;
  description?: string;
  dueAt?: string;
  maxScore?: string;
  status: LmsAssignmentStatus;
  attachmentKey?: string;
  attachmentOriginalName?: string;
  attachmentUrl?: string | null;
  schoolClass?: { id: string; name: string };
  subject?: { id: string; name: string };
  createdAt: string;
}

export interface LmsSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  textAnswer?: string;
  fileKey?: string;
  fileOriginalName?: string;
  fileUrl?: string | null;
  status: LmsSubmissionStatus;
  grade?: string;
  feedback?: string;
  submittedAt?: string;
  gradedAt?: string;
  student?: { id: string; firstName: string; lastName: string; admissionNumber: string };
}

export interface LessonContent {
  id: string;
  classId?: string;
  subjectId: string;
  title: string;
  description?: string;
  contentType: LessonContentType;
  externalUrl?: string;
  fileUrl?: string | null;
  fileOriginalName?: string;
  isPublished: boolean;
  sortOrder: number;
  subject?: { id: string; name: string };
  schoolClass?: { id: string; name: string };
  createdAt: string;
}

export interface VirtualClass {
  id: string;
  classId: string;
  subjectId?: string;
  teacherId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  provider: 'manual' | 'zoom' | 'google_meet';
  status: VirtualClassStatus;
  joinUrl?: string;
  hostUrl?: string;
  schoolClass?: { id: string; name: string };
  subject?: { id: string; name: string };
  recordings?: ClassRecording[];
}

export interface ClassRecording {
  id: string;
  virtualClassId: string;
  title: string;
  recordingUrl: string;
  durationSeconds?: number;
  recordedAt?: string;
}

export interface LibraryResource {
  id: string;
  title: string;
  description?: string;
  resourceType: LibraryResourceType;
  externalUrl?: string;
  fileUrl?: string | null;
  fileOriginalName?: string;
  subjectId?: string;
  gradeFormId?: string;
  isPublished: boolean;
  subject?: { id: string; name: string };
  gradeForm?: { id: string; name: string };
  createdAt: string;
}

export interface LibraryBookmark {
  id: string;
  resourceId: string;
  resource?: LibraryResource;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LmsApiService {
  private api = inject(ApiService);

  fileUrl(path?: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const origin = environment.apiUrl.replace(/\/api$/, '');
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }

  listAssignments(params?: Record<string, string>) {
    return this.api.get<LmsAssignment[]>('/lms/assignments', params);
  }

  getAssignment(id: string) {
    return this.api.get<LmsAssignment>(`/lms/assignments/${id}`);
  }

  createAssignment(form: FormData) {
    return this.api.postFormData<LmsAssignment>('/lms/assignments', form);
  }

  updateAssignment(id: string, form: FormData) {
    return this.api.putFormData<LmsAssignment>(`/lms/assignments/${id}`, form);
  }

  deleteAssignment(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/lms/assignments/${id}`);
  }

  listSubmissions(assignmentId: string) {
    return this.api.get<LmsSubmission[]>(`/lms/assignments/${assignmentId}/submissions`);
  }

  mySubmission(assignmentId: string) {
    return this.api.get<LmsSubmission | null>(`/lms/assignments/${assignmentId}/my-submission`);
  }

  submitAssignment(assignmentId: string, form: FormData) {
    return this.api.postFormData<LmsSubmission>(`/lms/assignments/${assignmentId}/submissions`, form);
  }

  gradeSubmission(submissionId: string, body: { grade: number; feedback?: string; status?: LmsSubmissionStatus }) {
    return this.api.post<LmsSubmission>(`/lms/submissions/${submissionId}/grade`, body);
  }

  listLessons(params?: Record<string, string>) {
    return this.api.get<LessonContent[]>('/lms/lessons', params);
  }

  createLesson(form: FormData) {
    return this.api.postFormData<LessonContent>('/lms/lessons', form);
  }

  deleteLesson(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/lms/lessons/${id}`);
  }

  listVirtualClasses(params?: Record<string, string>) {
    return this.api.get<VirtualClass[]>('/lms/virtual-classes', params);
  }

  createVirtualClass(body: Record<string, unknown>) {
    return this.api.post<VirtualClass>('/lms/virtual-classes', body);
  }

  updateVirtualClass(id: string, body: Record<string, unknown>) {
    return this.api.put<VirtualClass>(`/lms/virtual-classes/${id}`, body);
  }

  deleteVirtualClass(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/lms/virtual-classes/${id}`);
  }

  addRecording(virtualClassId: string, body: { title: string; recordingUrl: string; durationSeconds?: number }) {
    return this.api.post<ClassRecording>(`/lms/virtual-classes/${virtualClassId}/recordings`, body);
  }

  listRecordings(classId: string) {
    return this.api.get<ClassRecording[]>(`/lms/classes/${classId}/recordings`);
  }

  listLibrary(params?: Record<string, string>) {
    return this.api.get<LibraryResource[]>('/lms/library', params);
  }

  createLibraryResource(form: FormData) {
    return this.api.postFormData<LibraryResource>('/lms/library', form);
  }

  deleteLibraryResource(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/lms/library/${id}`);
  }

  listBookmarks() {
    return this.api.get<LibraryBookmark[]>('/lms/library/bookmarks');
  }

  bookmark(id: string) {
    return this.api.post<LibraryBookmark>(`/lms/library/${id}/bookmark`, {});
  }

  removeBookmark(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/lms/library/${id}/bookmark`);
  }
}
