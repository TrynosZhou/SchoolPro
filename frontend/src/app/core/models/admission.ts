export type ApplicationStatus = 'applied' | 'shortlisted' | 'admitted' | 'rejected';

export type ApplicationDocumentType =
  | 'birth_certificate'
  | 'report_card'
  | 'passport_photo'
  | 'id_copy'
  | 'other';

export interface ApplicationDocumentMeta {
  id: string;
  docType: ApplicationDocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Full application record (admin view). */
export interface Application {
  id: string;
  referenceNumber: string;
  studentFirstName: string;
  studentLastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  previousSchool?: string | null;
  classAppliedFor: string;
  guardianName: string;
  guardianRelationship?: string | null;
  contactPhone: string;
  contactEmail: string;
  address?: string | null;
  status: ApplicationStatus;
  statusNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  documents?: ApplicationDocumentMeta[];
}

/** Response after submitting the public application form. */
export interface ApplicationSubmitResponse {
  referenceNumber: string;
  status: ApplicationStatus;
  message: string;
}

/** Public (applicant-side) status lookup response. */
export interface ApplicationTracking {
  referenceNumber: string;
  studentName: string;
  classAppliedFor: string;
  status: ApplicationStatus;
  statusNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
}

export interface AdmissionClassOption {
  id: string;
  name: string;
}

/** Ordered pipeline stages for progress indicators. */
export const APPLICATION_STAGES: { key: ApplicationStatus; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'admitted', label: 'Admitted' },
];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  admitted: 'Admitted',
  rejected: 'Not successful',
};
