import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const attachmentUploadDir = join(__dirname, '..', '..', 'uploads', 'email-attachments');

if (!fs.existsSync(attachmentUploadDir)) {
  fs.mkdirSync(attachmentUploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, attachmentUploadDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase();
    const safeBase = (file.originalname || 'attachment')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      || 'attachment';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${safeBase}${safeExt}`);
  },
});

const ensureSafeName = (fileName) => {
  if (!fileName) return '';
  const normalized = String(fileName).replace(/\\/g, '/');
  return normalized.split('/').pop() || '';
};

const fileFilter = (_req, file, cb) => {
  const originalName = ensureSafeName(file.originalname || '');
  const ext = path.extname(originalName).toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  if (!originalName || !ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
    const error = new Error('Only PDF, JPG, JPEG, PNG, and WEBP files are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    return cb(error);
  }

  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    const error = new Error('Invalid filename.');
    error.code = 'INVALID_FILENAME';
    return cb(error);
  }

  if (originalName.toLowerCase().endsWith('.exe') || originalName.toLowerCase().endsWith('.bat') || originalName.toLowerCase().endsWith('.sh')) {
    const error = new Error('Executable files are not allowed.');
    error.code = 'EXECUTABLE_FILE';
    return cb(error);
  }

  cb(null, true);
};

export const uploadEmailAttachment = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

export const emailAttachmentUploadDir = attachmentUploadDir;
export const emailAttachmentMaxFileSizeBytes = MAX_FILE_SIZE_BYTES;
export const emailAttachmentMaxFileSizeMb = 10;
export const emailAttachmentAllowedMimeTypes = [...ALLOWED_MIME_TYPES];
export const emailAttachmentAllowedExtensions = [...ALLOWED_EXTENSIONS];

export const buildPublicAttachmentUrl = (req, filePath) => {
  if (!filePath) return null;
  const relativePath = filePath.replace(/\\/g, '/');
  const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  if (!host) {
    return normalized;
  }
  return `${protocol}://${host}${normalized}`;
};

export const getAttachmentStoragePath = () => attachmentUploadDir;
export const getAttachmentUploadRoot = () => join(__dirname, '..', '..', 'uploads');
export const getAttachmentUploadBaseUrl = (req) => {
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  return host ? `${protocol}://${host}/uploads/email-attachments` : '/uploads/email-attachments';
};

export const getAttachmentFileName = (file) => {
  if (!file) return null;
  return file.filename || file.storedName || path.basename(file.path || '');
};

export const resolveAttachmentFilePath = (file) => {
  if (!file) return null;
  const fileName = getAttachmentFileName(file);
  if (!fileName) return null;
  return join(attachmentUploadDir, fileName);
};
export const resolveAttachmentRelativePath = (req, file) => {
  const fileName = getAttachmentFileName(file);
  if (!fileName) return null;
  return `${config.uploadPath}/email-attachments/${fileName}`.replace(/\\/g, '/');
};
