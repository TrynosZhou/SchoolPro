"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.homeworkAssignmentUpload = exports.MAX_HOMEWORK_FILE_BYTES = exports.homeworkAssignmentsDir = void 0;
exports.ensureHomeworkAssignmentsDir = ensureHomeworkAssignmentsDir;
exports.homeworkFileUrl = homeworkFileUrl;
exports.removeHomeworkFile = removeHomeworkFile;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
exports.homeworkAssignmentsDir = path_1.default.join(process.cwd(), 'uploads', 'homework-assignments');
exports.MAX_HOMEWORK_FILE_BYTES = 10 * 1024 * 1024;
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
function ensureHomeworkAssignmentsDir() {
    if (!fs_1.default.existsSync(exports.homeworkAssignmentsDir)) {
        fs_1.default.mkdirSync(exports.homeworkAssignmentsDir, { recursive: true });
    }
}
exports.homeworkAssignmentUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            ensureHomeworkAssignmentsDir();
            cb(null, exports.homeworkAssignmentsDir);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase().slice(0, 12);
            const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
            cb(null, `${Date.now()}-${crypto_1.default.randomBytes(8).toString('hex')}${safeExt}`);
        },
    }),
    limits: { fileSize: exports.MAX_HOMEWORK_FILE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error(`File type not allowed: ${file.originalname}`));
    },
});
function homeworkFileUrl(storedFileName) {
    return `/uploads/homework-assignments/${storedFileName}`;
}
function removeHomeworkFile(storedFileName) {
    const fullPath = path_1.default.join(exports.homeworkAssignmentsDir, storedFileName);
    if (fs_1.default.existsSync(fullPath)) {
        try {
            fs_1.default.unlinkSync(fullPath);
        }
        catch {
            /* ignore */
        }
    }
}
