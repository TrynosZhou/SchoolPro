"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_MESSAGE_RECIPIENT_ROLES = exports.messageAttachmentUpload = exports.MAX_ATTACHMENT_BYTES = exports.MAX_MESSAGE_ATTACHMENTS = exports.messageAttachmentsDir = void 0;
exports.ensureMessageAttachmentsDir = ensureMessageAttachmentsDir;
exports.resolveAdminRecipient = resolveAdminRecipient;
exports.resolveStaffRecipientByEmail = resolveStaffRecipientByEmail;
exports.removeAttachmentFiles = removeAttachmentFiles;
exports.formatBytes = formatBytes;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const enums_1 = require("../entities/enums");
exports.messageAttachmentsDir = path_1.default.join(process.cwd(), 'uploads', 'message-attachments');
exports.MAX_MESSAGE_ATTACHMENTS = 5;
exports.MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
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
function ensureMessageAttachmentsDir() {
    if (!fs_1.default.existsSync(exports.messageAttachmentsDir)) {
        fs_1.default.mkdirSync(exports.messageAttachmentsDir, { recursive: true });
    }
}
exports.messageAttachmentUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            ensureMessageAttachmentsDir();
            cb(null, exports.messageAttachmentsDir);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase().slice(0, 12);
            const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
            cb(null, `${Date.now()}-${crypto_1.default.randomBytes(8).toString('hex')}${safeExt}`);
        },
    }),
    limits: { fileSize: exports.MAX_ATTACHMENT_BYTES, files: exports.MAX_MESSAGE_ATTACHMENTS },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error(`File type not allowed: ${file.originalname}`));
    },
});
async function resolveAdminRecipient(userRepo) {
    for (const role of [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL]) {
        const user = await userRepo.findOne({
            where: { role, isActive: true },
            order: { createdAt: 'ASC' },
        });
        if (user)
            return user;
    }
    return null;
}
exports.PARENT_MESSAGE_RECIPIENT_ROLES = [
    enums_1.UserRole.ADMIN,
    enums_1.UserRole.DIRECTOR,
    enums_1.UserRole.PRINCIPAL,
    enums_1.UserRole.TEACHER,
];
async function resolveStaffRecipientByEmail(userRepo, email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized)
        return null;
    const user = await userRepo.findOne({ where: { email: normalized, isActive: true } });
    if (!user || !exports.PARENT_MESSAGE_RECIPIENT_ROLES.includes(user.role))
        return null;
    return user;
}
function removeAttachmentFiles(storedNames) {
    for (const storedName of storedNames) {
        const fullPath = path_1.default.join(exports.messageAttachmentsDir, storedName);
        if (fs_1.default.existsSync(fullPath)) {
            try {
                fs_1.default.unlinkSync(fullPath);
            }
            catch {
                /* ignore */
            }
        }
    }
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
