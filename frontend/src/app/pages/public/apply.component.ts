import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  AdmissionClassOption,
  ApplicationSubmitResponse,
} from '../../core/models/admission';

interface ApplicantPrefill {
  guardianName: string;
  guardianRelationship: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
}

interface DocSlot {
  field: 'birthCertificate' | 'reportCard' | 'passportPhoto' | 'idCopy';
  label: string;
  hint: string;
  required: boolean;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './apply.component.html',
  styleUrl: './apply.component.scss',
})
export class ApplyComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly currentYear = new Date().getFullYear();

  classOptions = signal<AdmissionClassOption[]>([]);
  submitting = signal(false);
  submitted = signal<ApplicationSubmitResponse | null>(null);
  error = signal('');
  prefilled = signal(false);

  readonly docSlots: DocSlot[] = [
    {
      field: 'birthCertificate',
      label: 'Birth certificate',
      hint: 'Required',
      required: true,
    },
    {
      field: 'passportPhoto',
      label: 'Passport photo',
      hint: 'Required',
      required: true,
    },
    {
      field: 'idCopy',
      label: 'ID / passport copy',
      hint: 'Required — student or guardian',
      required: true,
    },
    {
      field: 'reportCard',
      label: 'Previous school report card',
      hint: 'Optional',
      required: false,
    },
  ];

  files: Record<string, File | null> = {
    birthCertificate: null,
    reportCard: null,
    passportPhoto: null,
    idCopy: null,
  };
  fileErrors = signal<Record<string, string>>({});

  form = {
    studentFirstName: '',
    studentLastName: '',
    dateOfBirth: '',
    gender: '',
    previousSchool: '',
    classAppliedFor: '',
    guardianName: '',
    guardianRelationship: 'Parent',
    contactPhone: '',
    contactEmail: '',
    address: '',
  };

  ngOnInit(): void {
    this.api.get<AdmissionClassOption[]>('/admissions/classes').subscribe({
      next: (rows) => this.classOptions.set(rows || []),
      error: () => this.classOptions.set([]),
    });

    // When a signed-in parent chooses "Apply for another child", pre-fill their
    // known guardian/contact details. Only attempted when authenticated so the
    // public form never triggers an auth redirect.
    const wantsPrefill = this.route.snapshot.queryParamMap.get('prefill') === '1';
    if (wantsPrefill && this.auth.getToken()) {
      this.api.get<ApplicantPrefill>('/admissions/prefill').subscribe({
        next: (p) => {
          this.form.guardianName = p.guardianName || this.form.guardianName;
          this.form.guardianRelationship = p.guardianRelationship || this.form.guardianRelationship;
          this.form.contactEmail = p.contactEmail || this.form.contactEmail;
          this.form.contactPhone = p.contactPhone || this.form.contactPhone;
          this.form.address = p.address || this.form.address;
          this.prefilled.set(true);
        },
        error: () => {
          /* prefill is best-effort; ignore failures */
        },
      });
    }
  }

  onFileSelected(field: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const errors = { ...this.fileErrors() };
    delete errors[field];

    if (file) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors[field] = 'Only PDF, JPG or PNG files are allowed.';
        input.value = '';
        this.files[field] = null;
        this.fileErrors.set(errors);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors[field] = 'File must be 5MB or smaller.';
        input.value = '';
        this.files[field] = null;
        this.fileErrors.set(errors);
        return;
      }
    }

    this.files[field] = file;
    this.fileErrors.set(errors);
  }

  clearFile(field: string): void {
    this.files[field] = null;
    const errors = { ...this.fileErrors() };
    delete errors[field];
    this.fileErrors.set(errors);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private validate(): string {
    const f = this.form;
    if (!f.studentFirstName.trim() || !f.studentLastName.trim()) {
      return "Enter the student's first and last name.";
    }
    if (!f.classAppliedFor.trim()) return 'Select the class you are applying for.';
    if (!f.guardianName.trim()) return "Enter the parent/guardian's full name.";
    if (!f.contactPhone.trim()) return 'Enter a contact phone number.';
    if (!f.contactEmail.trim()) return 'Enter a contact email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) {
      return 'Enter a valid contact email address.';
    }
    for (const slot of this.docSlots) {
      if (slot.required && !this.files[slot.field]) {
        return `Please upload the required document: ${slot.label}.`;
      }
    }
    if (Object.keys(this.fileErrors()).length) {
      return 'Please fix the highlighted document errors before submitting.';
    }
    return '';
  }

  submit(): void {
    this.error.set('');
    const validationError = this.validate();
    if (validationError) {
      this.error.set(validationError);
      return;
    }

    const fd = new FormData();
    fd.append('studentFirstName', this.form.studentFirstName.trim());
    fd.append('studentLastName', this.form.studentLastName.trim());
    fd.append('dateOfBirth', this.form.dateOfBirth || '');
    fd.append('gender', this.form.gender || '');
    fd.append('previousSchool', this.form.previousSchool.trim());
    fd.append('classAppliedFor', this.form.classAppliedFor.trim());
    fd.append('guardianName', this.form.guardianName.trim());
    fd.append('guardianRelationship', this.form.guardianRelationship.trim());
    fd.append('contactPhone', this.form.contactPhone.trim());
    fd.append('contactEmail', this.form.contactEmail.trim());
    fd.append('address', this.form.address.trim());

    for (const slot of this.docSlots) {
      const file = this.files[slot.field];
      if (file) fd.append(slot.field, file);
    }

    this.submitting.set(true);
    this.api.postFormData<ApplicationSubmitResponse>('/admissions', fd).subscribe({
      next: (res) => {
        this.submitted.set(res);
        this.submitting.set(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (e) => {
        this.error.set(e.error?.message || 'Could not submit your application. Please try again.');
        this.submitting.set(false);
      },
    });
  }
}
