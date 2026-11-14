import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';

export const admissionDocumentsDir = path.join(process.cwd(), 'uploads', 'admission-documents');

/** Max size per uploaded document. */
export const MAX_ADMISSION_DOC_BYTES = 5 * 1024 * 1024;

/** Allowed document formats: PDF, JPG/JPEG, PNG. */
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Upload field names map 1:1 to ApplicationDocumentType categories. */
export const ADMISSION_DOC_FIELDS = [
  { name: 'birthCertificate', docType: 'birth_certificate' },
  { name: 'reportCard', docType: 'report_card' },
  { name: 'passportPhoto', docType: 'passport_photo' },
  { name: 'idCopy', docType: 'id_copy' },
] as const;

export function ensureAdmissionDocumentsDir(): void {
  if (!fs.existsSync(admissionDocumentsDir)) {
    fs.mkdirSync(admissionDocumentsDir, { recursive: true });
  }
}

export const admissionDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureAdmissionDocumentsDir();
      cb(null, admissionDocumentsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
      const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: MAX_ADMISSION_DOC_BYTES, files: ADMISSION_DOC_FIELDS.length },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Unsupported file type for ${file.originalname}. Allowed: PDF, JPG, PNG.`));
  },
});

export function removeAdmissionDocumentFiles(storedNames: string[]): void {
  for (const storedName of storedNames) {
    const fullPath = path.join(admissionDocumentsDir, storedName);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  }
}
