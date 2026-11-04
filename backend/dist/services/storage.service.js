"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
function sanitizeExt(originalName) {
    const ext = path_1.default.extname(originalName).toLowerCase().slice(0, 12);
    return ext && /^[.a-z0-9]+$/.test(ext) ? ext : '';
}
function buildKey(folder, originalName) {
    const safeExt = sanitizeExt(originalName);
    return `${folder}/${Date.now()}-${crypto_1.default.randomBytes(8).toString('hex')}${safeExt}`;
}
function localRoot() {
    return path_1.default.join(process.cwd(), 'uploads');
}
function ensureDirForKey(key) {
    const full = path_1.default.join(localRoot(), path_1.default.dirname(key));
    if (!fs_1.default.existsSync(full))
        fs_1.default.mkdirSync(full, { recursive: true });
}
async function putLocal(input) {
    const key = buildKey(input.folder, input.originalName);
    ensureDirForKey(key);
    const fullPath = path_1.default.join(localRoot(), key);
    await fs_1.default.promises.writeFile(fullPath, input.buffer);
    return {
        key,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.buffer.length,
        url: `/uploads/${key.replace(/\\/g, '/')}`,
    };
}
async function deleteLocal(key) {
    const fullPath = path_1.default.join(localRoot(), key);
    if (fs_1.default.existsSync(fullPath))
        await fs_1.default.promises.unlink(fullPath);
}
async function getLocalStream(key) {
    const fullPath = path_1.default.join(localRoot(), key);
    return fs_1.default.createReadStream(fullPath);
}
function localPublicUrl(key) {
    return `/uploads/${key.replace(/\\/g, '/')}`;
}
async function putS3(input) {
    const { S3Client, PutObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const key = buildKey(input.folder, input.originalName);
    const client = new S3Client({
        region: env_1.env.storage.s3.region,
        endpoint: env_1.env.storage.s3.endpoint || undefined,
        forcePathStyle: Boolean(env_1.env.storage.s3.endpoint),
        credentials: {
            accessKeyId: env_1.env.storage.s3.accessKeyId,
            secretAccessKey: env_1.env.storage.s3.secretAccessKey,
        },
    });
    await client.send(new PutObjectCommand({
        Bucket: env_1.env.storage.s3.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
    }));
    const base = env_1.env.storage.s3.publicBaseUrl.replace(/\/$/, '');
    return {
        key,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.buffer.length,
        url: base ? `${base}/${key}` : key,
    };
}
async function deleteS3(key) {
    const { S3Client, DeleteObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const client = new S3Client({
        region: env_1.env.storage.s3.region,
        endpoint: env_1.env.storage.s3.endpoint || undefined,
        forcePathStyle: Boolean(env_1.env.storage.s3.endpoint),
        credentials: {
            accessKeyId: env_1.env.storage.s3.accessKeyId,
            secretAccessKey: env_1.env.storage.s3.secretAccessKey,
        },
    });
    await client.send(new DeleteObjectCommand({
        Bucket: env_1.env.storage.s3.bucket,
        Key: key,
    }));
}
async function getS3Stream(key) {
    const { S3Client, GetObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const client = new S3Client({
        region: env_1.env.storage.s3.region,
        endpoint: env_1.env.storage.s3.endpoint || undefined,
        forcePathStyle: Boolean(env_1.env.storage.s3.endpoint),
        credentials: {
            accessKeyId: env_1.env.storage.s3.accessKeyId,
            secretAccessKey: env_1.env.storage.s3.secretAccessKey,
        },
    });
    const res = await client.send(new GetObjectCommand({
        Bucket: env_1.env.storage.s3.bucket,
        Key: key,
    }));
    return res.Body;
}
function s3PublicUrl(key) {
    const base = env_1.env.storage.s3.publicBaseUrl.replace(/\/$/, '');
    return base ? `${base}/${key}` : key;
}
/** Hybrid storage: local disk (dev) or S3-compatible (prod). */
exports.storageService = {
    driver() {
        return env_1.env.storage.driver;
    },
    maxUploadBytes() {
        return env_1.env.storage.maxUploadMb * 1024 * 1024;
    },
    async put(input) {
        if (input.buffer.length > this.maxUploadBytes()) {
            throw new Error(`File exceeds maximum size of ${env_1.env.storage.maxUploadMb}MB`);
        }
        return env_1.env.storage.driver === 's3' ? putS3(input) : putLocal(input);
    },
    async delete(key) {
        if (!key)
            return;
        return env_1.env.storage.driver === 's3' ? deleteS3(key) : deleteLocal(key);
    },
    async getStream(key) {
        return env_1.env.storage.driver === 's3' ? getS3Stream(key) : getLocalStream(key);
    },
    publicUrl(key) {
        if (!key)
            return null;
        return env_1.env.storage.driver === 's3' ? s3PublicUrl(key) : localPublicUrl(key);
    },
};
