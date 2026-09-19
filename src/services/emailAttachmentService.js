import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import EmailAttachment from '../models/EmailAttachment.js';
import { getAttachmentUploadRoot, getAttachmentStoragePath, getAttachmentUploadBaseUrl } from '../middleware/uploadEmailAttachment.js';

const normalizeObjectId = (value) => {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
};

const isPathInsideUploadRoot = (candidatePath) => {
  const uploadRoot = path.resolve(getAttachmentUploadRoot());
  const resolved = path.resolve(candidatePath);
  return resolved === uploadRoot || resolved.startsWith(uploadRoot + path.sep);
};

export const buildEmailAttachments = async (attachmentIds = []) => {
  if (!Array.isArray(attachmentIds)) {
    return [];
  }

  const normalizedIds = attachmentIds
    .map((value) => (typeof value === 'string' ? value : value?.toString?.()))
    .filter(Boolean)
    .map((value) => normalizeObjectId(value))
    .filter(Boolean);

  if (normalizedIds.length === 0) {
    return [];
  }

  const attachments = await EmailAttachment.find({
    _id: { $in: normalizedIds },
    isActive: true,
  }).lean();

  const sanitizeFilename = (value) => String(value || 'attachment')
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ');

  const sanitizeContentType = (mimeType) => {
    const raw = String(mimeType || '').trim();
    return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(raw)
      ? raw
      : 'application/octet-stream';
  };

  const builtAttachments = [];
  const errors = [];

  for (const attachment of attachments) {
    const resolvedPath = path.resolve(getAttachmentStoragePath(), attachment.storedName || path.basename(attachment.filePath || ''));
    const exists = fs.existsSync(resolvedPath);
    if (!exists) {
      errors.push(`${attachment.name || attachment.originalName} could not be found. Remove the attachment or upload it again.`);
      continue;
    }

    if (!isPathInsideUploadRoot(resolvedPath)) {
      errors.push(`${attachment.name || attachment.originalName} could not be resolved safely.`);
      continue;
    }

    const filename = sanitizeFilename(attachment.originalName || attachment.name || path.basename(attachment.filePath || resolvedPath || 'attachment'));
    builtAttachments.push({
      filename,
      path: resolvedPath,
      contentType: sanitizeContentType(attachment.mimeType),
      contentDisposition: 'attachment',
    });
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(' '));
    error.code = 'ATTACHMENT_VALIDATION';
    throw error;
  }

  return builtAttachments;
};

export const formatAttachmentSize = (sizeInBytes) => {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB'];
  let value = sizeInBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
};

export const getAttachmentLabel = (attachment) => {
  if (!attachment) return 'Attachment';
  const baseName = attachment.name || attachment.originalName || 'Attachment';
  const safeName = String(baseName).trim();
  return safeName || 'Attachment';
};

export const getAttachmentSummary = (attachment) => {
  const label = getAttachmentLabel(attachment);
  const mime = attachment?.mimeType || 'application/octet-stream';
  const size = formatAttachmentSize(attachment?.fileSize || 0);
  return `${label} • ${mime.split('/')[1]?.toUpperCase() || 'FILE'} • ${size}`;
};

export const getAttachmentDownloadUrl = (req, attachment) => {
  if (!attachment) return null;
  const fileName = attachment.storedName || attachment.fileName || path.basename(attachment.filePath || '');
  if (!fileName) return null;
  const baseUrl = getAttachmentUploadBaseUrl(req);
  return `${baseUrl}/${encodeURIComponent(fileName)}`;
};
