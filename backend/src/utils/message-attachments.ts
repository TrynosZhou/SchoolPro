import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { Repository } from 'typeorm';
import { User } from '../entities';
import { UserRole } from '../entities/enums';

export const messageAttachmentsDir = path.join(process.cwd(), 'uploads', 'message-attachments');

export const MAX_MESSAGE_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export function ensureMessageAttachmentsDir(): void {
  if (!fs.existsSync(messageAttachmentsDir)) {
    fs.mkdirSync(messageAttachmentsDir, { recursive: true });
  }
}

export const messageAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureMessageAttachmentsDir();
      cb(null, messageAttachmentsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
      const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_MESSAGE_ATTACHMENTS },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(`File type not allowed: ${file.originalname}`));
  },
});

export async function resolveAdminRecipient(userRepo: Repository<User>): Promise<User | null> {
  for (const role of [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.PRINCIPAL]) {
    const user = await userRepo.findOne({
      where: { role, isActive: true },
      order: { createdAt: 'ASC' },
    });
    if (user) return user;
  }
  return null;
}

export const PARENT_MESSAGE_RECIPIENT_ROLES = [
  UserRole.ADMIN,
  UserRole.DIRECTOR,
  UserRole.PRINCIPAL,
  UserRole.TEACHER,
];

export async function resolveStaffRecipientByEmail(
  userRepo: Repository<User>,
  email: string,
): Promise<User | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const user = await userRepo.findOne({ where: { email: normalized, isActive: true } });
  if (!user || !PARENT_MESSAGE_RECIPIENT_ROLES.includes(user.role)) return null;
  return user;
}

export function removeAttachmentFiles(storedNames: string[]): void {
  for (const storedName of storedNames) {
    const fullPath = path.join(messageAttachmentsDir, storedName);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
