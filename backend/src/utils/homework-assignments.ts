import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';

export const homeworkAssignmentsDir = path.join(process.cwd(), 'uploads', 'homework-assignments');

export const MAX_HOMEWORK_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function ensureHomeworkAssignmentsDir(): void {
  if (!fs.existsSync(homeworkAssignmentsDir)) {
    fs.mkdirSync(homeworkAssignmentsDir, { recursive: true });
  }
}

export const homeworkAssignmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureHomeworkAssignmentsDir();
      cb(null, homeworkAssignmentsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
      const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: MAX_HOMEWORK_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(`File type not allowed: ${file.originalname}`));
  },
});

export function homeworkFileUrl(storedFileName: string): string {
  return `/uploads/homework-assignments/${storedFileName}`;
}

export function removeHomeworkFile(storedFileName: string): void {
  const fullPath = path.join(homeworkAssignmentsDir, storedFileName);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      /* ignore */
    }
  }
}
