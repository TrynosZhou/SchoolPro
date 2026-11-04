"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.admissionDocumentUpload = exports.ADMISSION_DOC_FIELDS = exports.MAX_ADMISSION_DOC_BYTES = exports.admissionDocumentsDir = void 0;
exports.ensureAdmissionDocumentsDir = ensureAdmissionDocumentsDir;
exports.removeAdmissionDocumentFiles = removeAdmissionDocumentFiles;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
exports.admissionDocumentsDir = path_1.default.join(process.cwd(), 'uploads', 'admission-documents');
/** Max size per uploaded document. */
exports.MAX_ADMISSION_DOC_BYTES = 5 * 1024 * 1024;
/** Allowed document formats: PDF, JPG/JPEG, PNG. */
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
/** Upload field names map 1:1 to ApplicationDocumentType categories. */
exports.ADMISSION_DOC_FIELDS = [
    { name: 'birthCertificate', docType: 'birth_certificate' },
    { name: 'reportCard', docType: 'report_card' },
    { name: 'passportPhoto', docType: 'passport_photo' },
    { name: 'idCopy', docType: 'id_copy' },
];
function ensureAdmissionDocumentsDir() {
    if (!fs_1.default.existsSync(exports.admissionDocumentsDir)) {
        fs_1.default.mkdirSync(exports.admissionDocumentsDir, { recursive: true });
    }
}
exports.admissionDocumentUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            ensureAdmissionDocumentsDir();
            cb(null, exports.admissionDocumentsDir);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase().slice(0, 12);
            const safeExt = ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
            cb(null, `${Date.now()}-${crypto_1.default.randomBytes(8).toString('hex')}${safeExt}`);
        },
    }),
    limits: { fileSize: exports.MAX_ADMISSION_DOC_BYTES, files: exports.ADMISSION_DOC_FIELDS.length },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error(`Unsupported file type for ${file.originalname}. Allowed: PDF, JPG, PNG.`));
    },
});
function removeAdmissionDocumentFiles(storedNames) {
    for (const storedName of storedNames) {
        const fullPath = path_1.default.join(exports.admissionDocumentsDir, storedName);
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
