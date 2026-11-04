import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { env } from '../config/env';

export type StorageFolder =
  | 'lms-assignments'
  | 'lms-submissions'
  | 'lesson-content'
  | 'library'
  | 'class-recordings';

export interface StoredObject {
  key: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** Public or app-relative URL for download/preview. */
  url: string;
}

export interface PutObjectInput {
  folder: StorageFolder;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

function sanitizeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 12);
  return ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
}

function buildKey(folder: StorageFolder, originalName: string): string {
  const safeExt = sanitizeExt(originalName);
  return `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
}

function localRoot(): string {
  return path.join(process.cwd(), 'uploads');
}

function ensureDirForKey(key: string): void {
  const full = path.join(localRoot(), path.dirname(key));
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
}

async function putLocal(input: PutObjectInput): Promise<StoredObject> {
  const key = buildKey(input.folder, input.originalName);
  ensureDirForKey(key);
  const fullPath = path.join(localRoot(), key);
  await fs.promises.writeFile(fullPath, input.buffer);
  return {
    key,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    url: `/uploads/${key.replace(/\\/g, '/')}`,
  };
}

async function deleteLocal(key: string): Promise<void> {
  const fullPath = path.join(localRoot(), key);
  if (fs.existsSync(fullPath)) await fs.promises.unlink(fullPath);
}

async function getLocalStream(key: string): Promise<Readable> {
  const fullPath = path.join(localRoot(), key);
  return fs.createReadStream(fullPath);
}

function localPublicUrl(key: string): string {
  return `/uploads/${key.replace(/\\/g, '/')}`;
}

async function putS3(input: PutObjectInput): Promise<StoredObject> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const key = buildKey(input.folder, input.originalName);
  const client = new S3Client({
    region: env.storage.s3.region,
    endpoint: env.storage.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.storage.s3.endpoint),
    credentials: {
      accessKeyId: env.storage.s3.accessKeyId,
      secretAccessKey: env.storage.s3.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: env.storage.s3.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.mimeType,
    }),
  );
  const base = env.storage.s3.publicBaseUrl.replace(/\/$/, '');
  return {
    key,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    url: base ? `${base}/${key}` : key,
  };
}

async function deleteS3(key: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: env.storage.s3.region,
    endpoint: env.storage.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.storage.s3.endpoint),
    credentials: {
      accessKeyId: env.storage.s3.accessKeyId,
      secretAccessKey: env.storage.s3.secretAccessKey,
    },
  });
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.storage.s3.bucket,
      Key: key,
    }),
  );
}

async function getS3Stream(key: string): Promise<Readable> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: env.storage.s3.region,
    endpoint: env.storage.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.storage.s3.endpoint),
    credentials: {
      accessKeyId: env.storage.s3.accessKeyId,
      secretAccessKey: env.storage.s3.secretAccessKey,
    },
  });
  const res = await client.send(
    new GetObjectCommand({
      Bucket: env.storage.s3.bucket,
      Key: key,
    }),
  );
  return res.Body as Readable;
}

function s3PublicUrl(key: string): string {
  const base = env.storage.s3.publicBaseUrl.replace(/\/$/, '');
  return base ? `${base}/${key}` : key;
}

/** Hybrid storage: local disk (dev) or S3-compatible (prod). */
export const storageService = {
  driver(): 'local' | 's3' {
    return env.storage.driver;
  },

  maxUploadBytes(): number {
    return env.storage.maxUploadMb * 1024 * 1024;
  },

  async put(input: PutObjectInput): Promise<StoredObject> {
    if (input.buffer.length > this.maxUploadBytes()) {
      throw new Error(`File exceeds maximum size of ${env.storage.maxUploadMb}MB`);
    }
    return env.storage.driver === 's3' ? putS3(input) : putLocal(input);
  },

  async delete(key: string): Promise<void> {
    if (!key) return;
    return env.storage.driver === 's3' ? deleteS3(key) : deleteLocal(key);
  },

  async getStream(key: string): Promise<Readable> {
    return env.storage.driver === 's3' ? getS3Stream(key) : getLocalStream(key);
  },

  publicUrl(key?: string | null): string | null {
    if (!key) return null;
    return env.storage.driver === 's3' ? s3PublicUrl(key) : localPublicUrl(key);
  },
};
