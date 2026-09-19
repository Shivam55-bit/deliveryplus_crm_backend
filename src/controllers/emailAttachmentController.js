import fs from 'fs';
import path from 'path';
import EmailAttachment from '../models/EmailAttachment.js';
import { sendResponse, sendError } from '../utils/response.js';
import { emailAttachmentMaxFileSizeMb, getAttachmentStoragePath, buildPublicAttachmentUrl } from '../middleware/uploadEmailAttachment.js';
import { formatAttachmentSize } from '../services/emailAttachmentService.js';

const normalizeCategory = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const map = {
    terms: 'terms',
    'terms & conditions': 'terms',
    insurance: 'insurance',
    'moving guide': 'moving-guide',
    'moving-guide': 'moving-guide',
    movingguide: 'moving-guide',
    payment: 'payment',
    company: 'company',
    'company information': 'company',
    customer: 'customer',
    'customer information': 'customer',
    other: 'other',
  };
  return map[raw] || 'other';
};

const buildAttachmentPayload = (req, attachment) => ({
  _id: attachment._id,
  name: attachment.name,
  originalName: attachment.originalName,
  storedName: attachment.storedName,
  filePath: attachment.filePath,
  fileUrl: attachment.fileUrl || buildPublicAttachmentUrl(req, attachment.filePath),
  mimeType: attachment.mimeType,
  fileSize: attachment.fileSize,
  fileSizeLabel: formatAttachmentSize(attachment.fileSize),
  category: attachment.category,
  description: attachment.description,
  isDefault: attachment.isDefault,
  isActive: attachment.isActive,
  uploadedBy: attachment.uploadedBy,
  createdAt: attachment.createdAt,
  updatedAt: attachment.updatedAt,
});

export const listEmailAttachments = async (req, res, next) => {
  try {
    const includeInactive = String(req.query.active || '').toLowerCase() !== 'true';
    const filter = includeInactive ? {} : { isActive: true };
    const attachments = await EmailAttachment.find(filter).sort({ createdAt: -1 }).lean();
    sendResponse(res, 200, { attachments: attachments.map((attachment) => buildAttachmentPayload(req, attachment)) });
  } catch (error) {
    next(error);
  }
};

export const createEmailAttachment = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendError(res, 400, 'Please select at least one file to upload.');
    }

    const payloads = [];
    const uploadDir = getAttachmentStoragePath();

    for (const file of req.files) {
      const originalName = String(file.originalname || '').trim();
      const safeBaseName = path.basename(file.filename || file.originalname || 'attachment');
      const absolutePath = path.join(uploadDir, safeBaseName);
      const relativePath = `/uploads/email-attachments/${safeBaseName}`;
      const category = normalizeCategory(req.body.category || 'other');
      const displayName = String(req.body.name || '').trim() || path.parse(originalName).name;
      const description = String(req.body.description || '').trim();
      const isDefault = req.body.isDefault === 'true' || req.body.isDefault === true || req.body.isDefault === '1';
      const isActive = req.body.isActive !== 'false' && req.body.isActive !== false && req.body.isActive !== '0';

      if (!fs.existsSync(absolutePath)) {
        return sendError(res, 400, `Uploaded file ${originalName} could not be found on disk.`);
      }

      const attachment = await EmailAttachment.create({
        name: displayName,
        originalName,
        storedName: safeBaseName,
        filePath: relativePath,
        fileUrl: relativePath,
        mimeType: file.mimetype,
        fileSize: file.size,
        category,
        description,
        isDefault,
        isActive,
        uploadedBy: req.user?._id || null,
      });

      payloads.push(buildAttachmentPayload(req, attachment));
    }

    sendResponse(res, 201, { attachments: payloads, maxFileSizeMb: emailAttachmentMaxFileSizeMb }, 'Files uploaded successfully.');
  } catch (error) {
    next(error);
  }
};

export const getEmailAttachment = async (req, res, next) => {
  try {
    const attachment = await EmailAttachment.findById(req.params.id).lean();
    if (!attachment) return sendError(res, 404, 'Attachment not found.');
    sendResponse(res, 200, { attachment: buildAttachmentPayload(req, attachment) });
  } catch (error) {
    next(error);
  }
};

export const downloadEmailAttachment = async (req, res, next) => {
  try {
    const attachment = await EmailAttachment.findById(req.params.id).lean();
    if (!attachment) return sendError(res, 404, 'Attachment not found.');
    const filePath = path.join(getAttachmentStoragePath(), attachment.storedName || path.basename(attachment.filePath || ''));
    if (!fs.existsSync(filePath)) return sendError(res, 404, 'Attachment file not found on disk.');
    res.download(filePath, attachment.originalName || attachment.name);
  } catch (error) {
    next(error);
  }
};

export const updateEmailAttachment = async (req, res, next) => {
  try {
    const attachment = await EmailAttachment.findById(req.params.id);
    if (!attachment) return sendError(res, 404, 'Attachment not found.');

    const updatedFields = {
      name: req.body.name ?? attachment.name,
      description: req.body.description ?? attachment.description,
      category: normalizeCategory(req.body.category ?? attachment.category),
      isDefault: req.body.isDefault !== undefined ? (req.body.isDefault === true || req.body.isDefault === 'true' || req.body.isDefault === '1') : attachment.isDefault,
      isActive: req.body.isActive !== undefined ? (req.body.isActive === true || req.body.isActive === 'true' || req.body.isActive === '1') : attachment.isActive,
    };

    Object.assign(attachment, updatedFields);
    await attachment.save();

    sendResponse(res, 200, { attachment: buildAttachmentPayload(req, attachment) }, 'Attachment updated.');
  } catch (error) {
    next(error);
  }
};

export const deleteEmailAttachment = async (req, res, next) => {
  try {
    const attachment = await EmailAttachment.findById(req.params.id);
    if (!attachment) return sendError(res, 404, 'Attachment not found.');

    const shouldDeleteFile = req.body?.permanentDelete === true || req.body?.permanentDelete === 'true';
    if (shouldDeleteFile) {
      const filePath = path.join(getAttachmentStoragePath(), attachment.storedName || path.basename(attachment.filePath || ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await attachment.deleteOne();
      return sendResponse(res, 200, {}, 'Attachment permanently deleted.');
    }

    attachment.isActive = false;
    await attachment.save();
    sendResponse(res, 200, { attachment: buildAttachmentPayload(req, attachment) }, 'Attachment deactivated.');
  } catch (error) {
    next(error);
  }
};
