import multer from 'multer';
import { storageService } from '../services/storage.service';

/** Memory storage — files are persisted via StorageService (local or S3). */
export const lmsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.maxUploadBytes() },
});
