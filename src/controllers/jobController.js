import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Job from '../models/Job.js';
import Driver from '../models/Driver.js';
import Notification from '../models/Notification.js';
import ActivityLog from '../models/ActivityLog.js';
import Invoice from '../models/Invoice.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';
import { calculateBilling } from '../utils/billing.js';
import { sendQuotationEmail, sendBookingConfirmationEmail, sendCompletionDocumentsEmail } from '../services/emailService.js';
import { buildQuotationEmail, buildBookingConfirmationEmail } from '../utils/emailTemplates.js';
import { renderEmailTemplate } from '../services/templateRenderer.js';
import { buildPricingSnapshotForStorage, buildPricingSnapshot, safePricingValue } from '../services/pricingService.js';
import { getCustomerJobTotal, resolveDriverPrice } from '../services/driverPriceService.js';
import { calculateDriverSessionPricing, createDriverStartPricingSnapshot, finalizeDriverSessionPricing, deriveLegacyDriverPricing } from '../services/driverPricingService.js';
import { buildJobFilterQuery, calculateJobSummaryStats } from '../services/jobFilterService.js';
import { generateJobsCsv, buildCsvExportFilename } from '../services/csvExportService.js';
import { createAndSendDriverNotification, sendPushToUser } from '../services/pushNotificationService.js';
import EmailAttachment from '../models/EmailAttachment.js';
import Sequence from '../models/Sequence.js';
import { buildEmailAttachments } from '../services/emailAttachmentService.js';
import { mergeEmailAttachmentIds, normalizeEmailAttachmentIds } from '../utils/emailAttachmentSelection.js';
import { isSuperAdmin } from '../middleware/auth.js';

const JOB_COMPLETION_TERMS = {
  version: '1.0',
  title: 'Job Completion Terms',
  text: 'By accepting this completion, the driver confirms the job has been carried out, all customer terms have been acknowledged, and the final payment method and proof have been submitted for review.',
};

const parseBoolean = (value) => {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
};

const getUploadedFilePath = (file) => (file ? `/uploads/${file.filename}` : null);

export const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim() || null;
  }
  return null;
};

export const normalizeUrlValue = (value) => {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;

  return normalizeUrlValue(
    value.url
    ?? value.file?.url
    ?? value.data?.url
    ?? value.data?.file?.url
    ?? value.path
    ?? value.filePath,
  );
};

const normalizeSecureUrl = (value) => {
  const normalized = normalizeUrlValue(value);
  return normalized ? normalized.replace(/^http:\/\//i, 'https://') : null;
};

export const normalizeMediaUrl = (value) => {
  const normalized = normalizeSecureUrl(value);
  if (!normalized || normalized.startsWith('data:') || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const publicApiOrigin = String(
    process.env.PUBLIC_API_URL
    || process.env.API_PUBLIC_URL
    || (process.env.NODE_ENV === 'production' ? 'https://api.deliveryplus.tech' : ''),
  ).replace(/\/$/, '');

  return publicApiOrigin && normalized.startsWith('/')
    ? `${publicApiOrigin}${normalized}`
    : normalized;
};

const normalizeCompletionSignature = (req) => {
  const uploadedSignature = req.files?.customerEndSignature?.[0]
    || req.files?.customerSignature?.[0]
    || req.files?.endSignature?.[0]
    || req.file;

  const uploadedSignaturePath = getUploadedFilePath(uploadedSignature);

  return normalizeOptionalString(req.body?.customerEndSignature)
    ?? normalizeOptionalString(req.body?.customerSignature)
    ?? normalizeOptionalString(req.body?.signatureData)
    ?? normalizeOptionalString(req.body?.endSignature)
    ?? normalizeOptionalString(req.body?.signature)
    ?? uploadedSignaturePath
    ?? null;
};

const normalizeCompletionProof = (req) => {
  const uploadedProof = req.files?.paymentProof?.[0];
  const uploadedProofPath = getUploadedFilePath(uploadedProof);

  return normalizeSecureUrl(req.body?.paymentProof)
    ?? normalizeSecureUrl(req.body?.paymentProofUrl)
    ?? normalizeSecureUrl(req.body?.proofUrl)
    ?? uploadedProofPath
    ?? null;
};

const normalizeDamagePhotos = (req) => {
  const uploadedFiles = req.files?.damagePhotos || [];
  const uploadedPaths = uploadedFiles.map((file) => getUploadedFilePath(file)).filter(Boolean);

  let bodyPhotos = [];
  if (Array.isArray(req.body?.damagePhotos)) {
    bodyPhotos = req.body.damagePhotos.map((p) => (typeof p === 'string' ? p.trim() : p?.url)).filter(Boolean);
  } else if (typeof req.body?.damagePhotos === 'string') {
    try {
      const parsed = JSON.parse(req.body.damagePhotos);
      if (Array.isArray(parsed)) {
        bodyPhotos = parsed.map((p) => (typeof p === 'string' ? p.trim() : p?.url)).filter(Boolean);
      } else if (req.body.damagePhotos.trim()) {
        bodyPhotos = [req.body.damagePhotos.trim()];
      }
    } catch {
      if (req.body.damagePhotos.trim()) {
        bodyPhotos = [req.body.damagePhotos.trim()];
      }
    }
  }

  return [...uploadedPaths, ...bodyPhotos];
};

const normalizeCompletionPhotos = (req) => {
  const uploadedFiles = req.files?.photos || [];
  const uploadedPaths = uploadedFiles.map((file) => getUploadedFilePath(file)).filter(Boolean);

  let bodyPhotos = [];
  if (Array.isArray(req.body?.photos)) {
    bodyPhotos = req.body.photos.map((p) => (typeof p === 'string' ? p.trim() : p?.url)).filter(Boolean);
  } else if (typeof req.body?.photos === 'string') {
    try {
      const parsed = JSON.parse(req.body.photos);
      if (Array.isArray(parsed)) {
        bodyPhotos = parsed.map((p) => (typeof p === 'string' ? p.trim() : p?.url)).filter(Boolean);
      } else if (req.body.photos.trim()) {
        bodyPhotos = [req.body.photos.trim()];
      }
    } catch {
      if (req.body.photos.trim()) {
        bodyPhotos = [req.body.photos.trim()];
      }
    }
  }

  return [...uploadedPaths, ...bodyPhotos];
};

const normalizePaymentMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['online payment', 'online-payment', 'transfer', 'upi', 'bank-transfer', 'bank transfer'].includes(normalized)) {
    return 'online';
  }
  if (['cash payment', 'cash-on-delivery', 'cod'].includes(normalized)) {
    return 'cash';
  }
  if (['other payment', 'cheque', 'card', 'eft'].includes(normalized)) {
    return 'other';
  }
  return normalized;
};

const resolveTransactionReference = (req) => normalizeOptionalString(
  req.body?.transactionReference ??
  req.body?.paymentTransactionReference ??
  req.body?.transferId ??
  req.body?.upiId ??
  req.body?.reference,
) || '';

const resolveOtherPaymentDetails = (req) => normalizeOptionalString(
  req.body?.otherPaymentDetails ??
  req.body?.paymentDetails ??
  req.body?.otherDetails,
) || '';

const resolveCompletionNotes = (req) => String(
  req.body?.completionNotes ??
  req.body?.driverCompletionNotes ??
  req.body?.notes ??
  ''
).trim();

const normalizeUrlFromPath = (req, filePath) => {
  if (!filePath) return null;
  const trimmed = String(filePath).trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith('http') ? trimmed : `${req.protocol}:${trimmed}`;
  }
  let relative = trimmed.replace(/\\/g, '/');
  if (!relative.startsWith('/')) {
    const idx = relative.indexOf('/uploads');
    relative = idx >= 0 ? relative.slice(idx) : `/${relative}`;
  }
  const requestProtocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : requestProtocol;
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim();
  if (!host) return relative;
  return `${protocol}://${host}${relative}`;
};

const normalizeAddress = (value) => (value == null ? null : String(value).trim() || null);

const resolvePickupAddress = (body) => normalizeAddress(
  body.pickupAddress ??
  body.pickUpAddress ??
  body.originAddress ??
  body.pickup ??
  body.pickupLocation ??
  body.pickup_location
);

const resolveDropoffAddress = (body) => normalizeAddress(
  body.dropoffAddress ??
  body.dropOffAddress ??
  body.deliveryAddress ??
  body.destinationAddress ??
  body.dropAddress ??
  body.drop_address
);

const normalizeJobStatus = (status) => {
  if (['inTransit', 'in_transit', 'arrived', 'accepted', 'paused', 'inProgress', 'progress', 'in_progress'].includes(status)) {
    return 'started';
  }

  return status;
};

const normalizeJobType = (value) => String(value || '').trim().toLowerCase();

const normalizeLineItemsValue = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (item && typeof item === 'object') {
          const description = String(item.description ?? item.name ?? item.item ?? item.title ?? '').trim();
          const quantity = item.quantity ?? item.qty;
          if (!description) return '';
          return quantity !== undefined && quantity !== null && quantity !== ''
            ? `${description}-${quantity}`
            : description;
        }

        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (value && typeof value === 'object') {
    return String(value).trim();
  }

  return '';
};

const normalizeTruckSize = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/\s*(tonnes?|tons?|t)\s*$/i, '')
    .trim();

  return cleaned ? `${cleaned}T` : null;
};

const resolveScheduleMode = (body, existing = {}) => {
  const rawScheduleMode = body.scheduleMode ?? body.scheduledTimeMode ?? body.scheduleType ?? existing.scheduleMode ?? existing.scheduledTimeMode ?? existing.scheduleType;
  return String(rawScheduleMode || '').trim().toLowerCase() === 'window' ? 'window' : 'exact';
};

export const completeJobTermsDebug = (req, _res, next) => {
  const rawTermsAccepted = req.body?.termsAccepted
    ?? req.body?.acceptedTerms
    ?? req.body?.isTermsAccepted
    ?? req.body?.termsAgreed;

  console.log('COMPLETE_JOB_TERMS_DEBUG', {
    contentType: req.headers['content-type'],
    rawTermsAccepted,
    rawTermsAcceptedType: typeof rawTermsAccepted,
    parsedTermsAccepted: parseBoolean(rawTermsAccepted),
    bodyKeys: Object.keys(req.body || {}),
    fileFields: Object.keys(req.files || {}),
  });

  next();
};

const ALLOWED_JOB_TRANSITIONS = {
  pending: ['assigned'],
  assigned: ['accepted', 'inTransit', 'in_transit', 'started'],
  accepted: ['inTransit', 'in_transit', 'started'],
  inTransit: ['arrived', 'started'],
  in_transit: ['arrived', 'started'],
  arrived: ['started', 'inProgress', 'progress', 'in_progress'],
  started: ['paused', 'awaitingCompletion'],
  paused: ['started'],
  inProgress: ['awaitingCompletion'],
  progress: ['awaitingCompletion'],
  in_progress: ['awaitingCompletion'],
  awaitingCompletion: ['completed'],
};

const validateJobTransition = (currentStatus, nextStatus) => {
  const allowed = ALLOWED_JOB_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
};

const createActivityLog = async ({ userId, action, entityId, details, metadata }) => {
  if (!userId || !action || !entityId) return null;

  try {
    return await ActivityLog.create({
      userId,
      action,
      entity: 'Job',
      entityId,
      details,
      metadata,
    });
  } catch (error) {
    console.error('Activity log creation failed', error.message);
    return null;
  }
};

const buildCompletionPreview = (job) => {
  const startedAt = job.startedAt || job.timerStarted || (job.timeline || []).find((item) => item.action === 'Job Started')?.timestamp;
  const timerEnded = new Date();
  const totalWorkedMinutes = startedAt
    ? Math.max(0, Math.floor((new Date(timerEnded).getTime() - new Date(startedAt).getTime()) / 60000))
    : 0;

  const pricingSnapshot = buildPricingSnapshot({
    ...job,
    totalWorkedMinutes,
    pricing: job.pricing ?? job.pricingSnapshot,
  });

  const billingSummary = calculateBilling({
    ...job,
    totalWorkedMinutes,
    pricingSnapshot,
  });

  return {
    startedAt,
    timerEnded,
    totalWorkedMinutes,
    pricingSnapshot,
    billingSummary,
    requiresTerms: !job.termsAccepted,
    requiresSignature: !job.endSignature,
    requiresPaymentMethod: !job.paymentMethod,
    paymentProofRequired: job.paymentMethod === 'online',
    otherPaymentDetailsRequired: job.paymentMethod === 'other',
  };
};

export const normalizeJobForResponse = (job, options = {}) => {
  const plainJob = typeof job?.toObject === 'function' ? job.toObject() : { ...job };
  const defaultBookingStatus = plainJob.confirmationSent ? 'confirmed' : 'quotation';
  plainJob.bookingStatus = plainJob.bookingStatus || defaultBookingStatus;
  plainJob.quotation = plainJob.quotation || {
    status: plainJob.quotationSent ? 'sent' : 'draft',
    sentAt: plainJob.quotationSentAt || null,
    viewedAt: null,
    expiresAt: null,
    acceptedAt: null,
    rejectedAt: null,
  };
  plainJob.confirmation = plainJob.confirmation || {
    confirmedAt: (plainJob.bookingStatus === 'confirmed' && plainJob.confirmationSent) ? (plainJob.confirmationSentAt || plainJob.createdAt) : null,
    confirmedBy: null,
    emailSent: Boolean(plainJob.confirmationSent),
    emailSentAt: plainJob.confirmationSentAt || null,
    messageId: null,
    error: null,
  };
  const jobType = normalizeJobType(plainJob.jobType);

  const pricingSnapshot = jobType === 'moving'
    ? buildPricingSnapshot({
      ...plainJob,
      pricing: plainJob.pricing ?? plainJob.pricingSnapshot,
    })
    : {};

  const normalizedTruckSize = plainJob.truckSize ?? plainJob.truckSizeCount ?? plainJob.vehicleSize ?? plainJob.truckType ?? null;
  plainJob.truckSize = normalizedTruckSize ? String(normalizedTruckSize).trim() : null;
  if (plainJob.truckSizeCount !== undefined && plainJob.truckSizeCount !== null) {
    plainJob.truckSizeCount = plainJob.truckSize;
  }

  plainJob.scheduleMode = plainJob.scheduleMode === 'window' ? 'window' : 'exact';
  plainJob.scheduledTime = plainJob.scheduledTime ?? null;
  plainJob.scheduledStartTime = plainJob.scheduledStartTime ?? null;
  plainJob.scheduledEndTime = plainJob.scheduledEndTime ?? null;
  plainJob.pickupAddress = plainJob.pickupAddress ?? plainJob.pickup?.address ?? null;
  plainJob.jobReference = plainJob.jobNumber ?? null;
  plainJob.scheduledAt = plainJob.scheduledDate ? plainJob.scheduledDate : null;

  // Canonical Timing Fields with graceful legacy fallback
  plainJob.startedAt = plainJob.startedAt || plainJob.timerStarted || (plainJob.timeline || []).find((item) => item.action === 'Job Started')?.timestamp || null;
  plainJob.completedAt = plainJob.completedAt || plainJob.endedAt || plainJob.timerEnded || (plainJob.timeline || []).find((item) => item.action === 'Job Completed')?.timestamp || null;
  plainJob.endedAt = plainJob.completedAt;

  if (plainJob.totalWorkedMinutes === undefined || plainJob.totalWorkedMinutes === null || Number.isNaN(Number(plainJob.totalWorkedMinutes)) || Number(plainJob.totalWorkedMinutes) < 0) {
    if (plainJob.startedAt && plainJob.completedAt) {
      const dur = new Date(plainJob.completedAt).getTime() - new Date(plainJob.startedAt).getTime();
      plainJob.totalWorkedMinutes = Math.max(0, Math.floor(dur / 60000));
    } else {
      plainJob.totalWorkedMinutes = 0;
    }
  } else {
    plainJob.totalWorkedMinutes = Math.max(0, Math.floor(Number(plainJob.totalWorkedMinutes) || 0));
  }
  plainJob.billableHours = Number(((plainJob.totalWorkedMinutes || 0) / 60).toFixed(2));

  plainJob.hasDamage = Boolean(plainJob.hasDamage || (plainJob.damageReport && plainJob.damageReport !== 'None' && plainJob.damageReport.trim() !== ''));
  plainJob.damageReport = plainJob.damageReport || (plainJob.hasDamage ? 'Damage reported' : 'None');
  if (Array.isArray(plainJob.photos)) {
    plainJob.photos = plainJob.photos.map(normalizeMediaUrl).filter(Boolean);
  } else {
    plainJob.photos = [];
  }
  if (Array.isArray(plainJob.damagePhotos)) {
    plainJob.damagePhotos = plainJob.damagePhotos.map(normalizeMediaUrl).filter(Boolean);
  } else {
    plainJob.damagePhotos = [];
  }
  plainJob.startSignature = normalizeMediaUrl(plainJob.startSignature || plainJob.startAgreement?.customerSignature || null);
  if (plainJob.startAgreement && typeof plainJob.startAgreement === 'object') {
    plainJob.startAgreement = {
      ...plainJob.startAgreement,
      customerSignature: normalizeMediaUrl(plainJob.startAgreement.customerSignature || plainJob.startSignature),
      acceptedAt: plainJob.startAgreement.acceptedAt || plainJob.startedAt || null,
      startedAt: plainJob.startAgreement.startedAt || plainJob.startedAt || null,
      stairsOption: plainJob.startAgreement.stairsOption || (plainJob.startAgreement.stairsAtProperty ? 'yes' : 'no'),
    };
  } else {
    plainJob.startAgreement = null;
  }

  plainJob.paymentProof = normalizeMediaUrl(plainJob.paymentProof);
  plainJob.paymentProofUrl = normalizeMediaUrl(plainJob.paymentProofUrl);
  plainJob.customerSignature = normalizeMediaUrl(plainJob.customerSignature || plainJob.customerEndSignature || plainJob.endSignature);
  plainJob.customerEndSignature = normalizeMediaUrl(plainJob.customerEndSignature || plainJob.customerSignature);
  plainJob.driverCompletionSignature = normalizeMediaUrl(plainJob.driverCompletionSignature || plainJob.signature);

  if (plainJob.completion && typeof plainJob.completion === 'object') {
    plainJob.completion = {
      ...plainJob.completion,
      customerSignature: normalizeMediaUrl(plainJob.completion.customerSignature || plainJob.customerSignature),
      driverCompletionSignature: normalizeMediaUrl(plainJob.completion.driverCompletionSignature || plainJob.driverCompletionSignature),
      paymentProofUrl: normalizeMediaUrl(plainJob.completion.paymentProofUrl || plainJob.paymentProofUrl),
      photos: Array.isArray(plainJob.completion.photos) ? plainJob.completion.photos.map(normalizeMediaUrl).filter(Boolean) : (plainJob.photos || []),
      damagePhotos: Array.isArray(plainJob.completion.damagePhotos) ? plainJob.completion.damagePhotos.map(normalizeMediaUrl).filter(Boolean) : (plainJob.damagePhotos || []),
    };
  } else if (plainJob.status === 'completed') {
    plainJob.completion = {
      termsRead: true,
      termsAccepted: Boolean(plainJob.termsAccepted),
      customerSignature: plainJob.customerSignature,
      customerSignatureName: plainJob.customerSignatureName || null,
      driverCompletionSignature: plainJob.driverCompletionSignature || null,
      hasDamage: Boolean(plainJob.hasDamage),
      damageReport: plainJob.damageReport || 'None',
      damagePhotos: plainJob.damagePhotos || [],
      photos: plainJob.photos || [],
      paymentMethod: plainJob.paymentMethod || 'cash',
      amountReceived: plainJob.amountReceived ?? null,
      paymentProofUrl: plainJob.paymentProofUrl || null,
      transactionReference: plainJob.transactionReference || null,
      otherPaymentDetails: plainJob.otherPaymentDetails || null,
      notes: plainJob.completionNotes || null,
      completedAt: plainJob.completedAt || null,
      driverId: plainJob.completedByDriverId || null,
    };
  } else {
    plainJob.completion = null;
  }

  // Normalize per-driver work session assignments
  let rawAssignments = Array.isArray(plainJob.driverAssignments) ? plainJob.driverAssignments : [];
  if (rawAssignments.length === 0 && Array.isArray(plainJob.assignedDrivers) && plainJob.assignedDrivers.length > 0) {
    // Backfill from legacy assignedDrivers for seamless backwards compatibility
    rawAssignments = plainJob.assignedDrivers.map((driver, index) => {
      const dObj = typeof driver === 'object' && driver !== null ? driver : { _id: driver };
      return {
        driverId: dObj,
        role: index === 0 ? 'primary' : 'helper',
        assignedAt: plainJob.createdAt || plainJob.scheduledDate || null,
        status: plainJob.status === 'completed' ? 'completed' : plainJob.startedAt ? 'in_progress' : 'assigned',
        startedAt: plainJob.startedAt || null,
        completedAt: plainJob.completedAt || null,
        totalWorkedMinutes: plainJob.totalWorkedMinutes || null,
        startAgreement: plainJob.startAgreement || null,
      };
    });
  }

  plainJob.driverAssignments = rawAssignments.map((assignment, index) => {
    const a = typeof assignment?.toObject === 'function' ? assignment.toObject() : { ...assignment };
    const driverId = a.driverId?._id || a.driverId;
    const driverInfo = typeof a.driverId === 'object' && a.driverId !== null ? a.driverId : null;

    let workedMinutes = a.totalWorkedMinutes;
    if ((workedMinutes === undefined || workedMinutes === null) && a.startedAt && a.completedAt) {
      const dur = new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime();
      workedMinutes = Math.max(0, Math.floor(dur / 60000));
    }

    let startAgreement = null;
    if (a.startAgreement && typeof a.startAgreement === 'object') {
      startAgreement = {
        ...a.startAgreement,
        customerSignature: normalizeMediaUrl(a.startAgreement.customerSignature),
        acceptedAt: a.startAgreement.acceptedAt || a.startedAt || null,
        startedAt: a.startAgreement.startedAt || a.startedAt || null,
        stairsOption: a.startAgreement.stairsOption || (a.startAgreement.stairsAtProperty ? 'yes' : 'no'),
      };
    }

      let assignmentPricing = a.pricingSnapshot || null;
      const sessionStatus = a.status || (a.completedAt ? 'completed' : a.startedAt ? 'in_progress' : 'assigned');
      if (!assignmentPricing) {
        if (sessionStatus === 'completed') {
          assignmentPricing = finalizeDriverSessionPricing({ ...a, totalWorkedMinutes: workedMinutes }, plainJob, a.completedAt || plainJob.completedAt);
        } else if (sessionStatus === 'in_progress' || a.startedAt) {
          assignmentPricing = createDriverStartPricingSnapshot(plainJob);
        }
      }

      return {
        _id: a._id,
        driverId: String(driverId || ''),
        driver: driverInfo ? {
          _id: driverInfo._id,
          name: driverInfo.name || 'Driver',
          email: driverInfo.email,
          phone: driverInfo.phone,
        } : {
          _id: driverId,
          name: a.driverName || (index === 0 ? plainJob.driverName : 'Driver'),
        },
        role: a.role || (index === 0 ? 'primary' : 'helper'),
        assignedAt: a.assignedAt || plainJob.createdAt || null,
        assignedBy: a.assignedBy || null,
        status: sessionStatus,
        startedAt: a.startedAt || null,
        completedAt: a.completedAt || null,
        totalWorkedMinutes: workedMinutes !== undefined && workedMinutes !== null ? Number(workedMinutes) : null,
        pricingSnapshot: assignmentPricing,
        startAgreement,
        removedAt: a.removedAt || null,
      };
    });

  // Resolve myAssignment for Driver App
  const callerDriverId = String(options.driverId || options.userId || '');
  if (callerDriverId) {
    plainJob.myAssignment = plainJob.driverAssignments.find((a) => String(a.driverId) === callerDriverId && a.status !== 'removed') || null;
  } else if (options.forDriver && plainJob.driverAssignments.length > 0) {
    plainJob.myAssignment = plainJob.driverAssignments[0];
  } else {
    plainJob.myAssignment = null;
  }

  if (jobType === 'moving' && (plainJob.billing?.totalAmount === undefined || plainJob.billing?.totalAmount === null)) {
    plainJob.billing = { ...plainJob.billing, totalAmount: pricingSnapshot.finalTotal };
  }

  // Recalculate from the authoritative customer total so old jobs cannot return stale values.
  Object.assign(plainJob, resolveDriverPrice(plainJob, getCustomerJobTotal(pricingSnapshot, plainJob)));
  plainJob.showPriceToDriver = Boolean(plainJob.showDriverPrice);

  // If driver has a specific assignment payout, link it to driverPrice
  if (plainJob.myAssignment?.pricingSnapshot?.finalDriverAmount !== undefined && plainJob.myAssignment.pricingSnapshot.finalDriverAmount !== null) {
    plainJob.driverPrice = plainJob.myAssignment.pricingSnapshot.finalDriverAmount;
  }

  // Driver API response security sanitization
  if (options.forDriver) {
    const isVisibleToDriver = Boolean(plainJob.showDriverPrice);

    if (isVisibleToDriver) {
      // Driver is allowed to see their own session pricing
      if (plainJob.myAssignment && plainJob.myAssignment.pricingSnapshot) {
        const ps = plainJob.myAssignment.pricingSnapshot;
        plainJob.myAssignment.pricingSnapshot = {
          pricingType: ps.pricingType || 'hourly',
          hourlyRate: ps.hourlyRate,
          baseHours: ps.baseHours,
          baseAmount: ps.baseAmount,
          overtimeMinutes: ps.overtimeMinutes ?? 0,
          overtimeBlocks: ps.overtimeBlocks ?? 0,
          halfHourRate: ps.halfHourRate ?? (ps.hourlyRate ? ps.hourlyRate / 2 : null),
          overtimeAmount: ps.overtimeAmount ?? 0,
          finalDriverAmount: ps.finalDriverAmount,
          totalWorkedMinutes: ps.totalWorkedMinutes ?? plainJob.myAssignment.totalWorkedMinutes ?? 0,
          isFinal: Boolean(ps.isFinal),
          calculatedAt: ps.calculatedAt,
        };
      }

      // Mask other drivers' sensitive earnings for privacy
      plainJob.driverAssignments.forEach((da) => {
        if (String(da.driverId) !== callerDriverId) {
          da.pricingSnapshot = null;
        }
      });
    } else {
      // showDriverPrice is FALSE: Strip all pricing from driver payload
      if (plainJob.myAssignment) {
        plainJob.myAssignment.pricingSnapshot = null;
      }
      plainJob.driverAssignments.forEach((da) => {
        da.pricingSnapshot = null;
      });
      plainJob.driverPrice = null;
      plainJob.driverPriceType = null;
      plainJob.driverPricePercentage = null;
      plainJob.showDriverPrice = false;
      plainJob.showPriceToDriver = false;
    }

    plainJob.hourlyRate = null;
    plainJob.fixedPrice = null;
    plainJob.fixedQuote = null;
    plainJob.minimumChargeHours = null;
    plainJob.minimumLaborCost = null;
    plainJob.minimumEstimatedCost = null;
    plainJob.callOutFee = null;
    plainJob.calloutCharge = null;
    plainJob.travelBackFee = null;
    plainJob.travelBackCharge = null;
    plainJob.finalTotal = null;
    plainJob.estimatedCost = null;
    plainJob.quoteAmount = null;
    plainJob.totalAmount = null;
    plainJob.subtotal = null;
    plainJob.grandTotal = null;
    plainJob.bookingDepositAmount = null;
    plainJob.depositAmount = null;
    delete plainJob.billing;
    delete plainJob.pricing;
    delete plainJob.pricingSnapshot;
  }

  return plainJob;
};

const normalizeAssignedDriverId = (driver) => String(driver?._id || driver);

const getLockState = (status) => {
  const normalized = normalizeJobStatus(status);
  return ['completed', 'cancelled'].includes(normalized);
};

const getReadOnlyJobError = (status) => {
  const normalized = normalizeJobStatus(status);
  return normalized === 'completed'
    ? 'Completed jobs are read-only and can no longer be edited.'
    : 'Cancelled jobs are read-only and can no longer be edited.';
};

const buildCompletionDocumentsPayload = (job) => {
  const summary = {
    jobNumber: job.jobNumber,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    customerEmail: job.customerEmail,
    completedAt: job.completedAt,
    paymentMethod: job.paymentMethod,
    amountReceived: job.amountReceived,
    paymentProofUrl: job.paymentProofUrl,
    paymentTransactionReference: job.paymentTransactionReference,
    endSignature: job.endSignature,
  };
  const checksum = createHash('sha256').update(JSON.stringify(summary)).digest('hex').slice(0, 24);

  return {
    manifestVersion: '1.0',
    status: 'pending',
    sentAt: null,
    recipientCount: 0,
    recipients: [],
    checksum,
    summary,
    messageId: null,
  };
};

const ensureDriverOwnership = (job, userId) => {
  const assignedDriverIds = Array.isArray(job.assignedDrivers)
    ? job.assignedDrivers.map((driver) => normalizeAssignedDriverId(driver))
    : [];

  return assignedDriverIds.includes(String(userId));
};

const getDriverId = (reqUser) => String(reqUser?.id || reqUser?._id || '');

export const createJob = async (req, res, next) => {
  try {
    const createJobStartedAt = Date.now();
    console.time('create-job-backend');
    console.log('[create-job] request received');
    const payload = { ...req.body };
    delete payload.jobNumber;
    const pricingType = String(payload.pricingType ?? 'hourly').trim().toLowerCase();
    if (!['hourly', 'fixed'].includes(pricingType)) {
      return sendError(res, 400, 'Pricing type must be hourly or fixed.');
    }
    console.log('CREATE_JOB_BODY_DEBUG', {
      bodyKeys: Object.keys(req.body || {}),
      jobType: req.body?.jobType,
      customerName: req.body?.customerName,
      customerEmail: req.body?.customerEmail,
      customerPhone: req.body?.customerPhone,
      propertySize: req.body?.propertySize,
      itemList: req.body?.itemList,
      lineItems: req.body?.lineItems,
      pickupAddress: req.body?.pickupAddress,
      dropoffAddress: req.body?.dropAddress,
      scheduledDate: req.body?.scheduledDate,
      scheduledTime: req.body?.scheduledTime,
      scheduledStartTime: req.body?.scheduledStartTime,
      scheduledEndTime: req.body?.scheduledEndTime,
      truckSizeCount: req.body?.truckSizeCount,
      movers: req.body?.movers,
      hourlyRate: req.body?.hourlyRate,
      callOutFee: req.body?.callOutFee,
      callOutTimeMin: req.body?.callOutTimeMin,
      travelBackFee: req.body?.travelBackFee,
      travelBackTimeMin: req.body?.travelBackTimeMin,
      minimumChargeHours: req.body?.minimumChargeHours,
      minimumEstimatedCost: req.body?.minimumEstimatedCost,
      sendQuotationEmail: req.body?.sendQuotationEmail,
    });
    if (payload && payload.priority === 'none') delete payload.priority;

    const canonicalPickupAddress = resolvePickupAddress(payload);
    const canonicalDropoffAddress = resolveDropoffAddress(payload);

    if (canonicalPickupAddress) payload.pickupAddress = canonicalPickupAddress;
    if (canonicalDropoffAddress) payload.dropAddress = canonicalDropoffAddress;

    const jobType = normalizeJobType(payload.jobType);
    if (!['moving', 'delivery'].includes(jobType)) {
      return sendError(res, 400, 'Job type must be Moving or Delivery.');
    }
    payload.jobType = jobType;

    const scheduleMode = String(payload.scheduleMode || payload.scheduledTimeMode || payload.scheduleType || '').trim().toLowerCase() === 'window'
      ? 'window'
      : 'exact';

    const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';
    const normalizeAttachmentIds = (ids) => {
      if (!Array.isArray(ids)) return [];
      return Array.from(new Set(
        ids
          .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
          .filter(Boolean),
      ));
    };

    const normalizedEmail = typeof payload.customerEmail === 'string'
      ? payload.customerEmail.trim().toLowerCase()
      : '';
    const bookingDepositAmount = payload.bookingDepositAmount !== null && payload.bookingDepositAmount !== undefined && payload.bookingDepositAmount !== ''
      ? Number(payload.bookingDepositAmount)
      : (payload.confirmationAmount !== null && payload.confirmationAmount !== undefined && payload.confirmationAmount !== ''
        ? Number(payload.confirmationAmount)
        : null);

    if (jobType === 'delivery') {
      payload.hourlyRate = null;
      payload.fixedPrice = null;
      payload.estimatedHours = null;
      payload.truckSizeCount = null;
      payload.movers = null;
      payload.callOutFee = null;
      payload.callOutTimeHr = null;
      payload.callOutTimeMin = null;
      payload.travelBackFee = null;
      payload.travelBackTimeHr = null;
      payload.travelBackTimeMin = null;
      payload.discount = null;
      payload.pricingType = null;
    }

    const pricingSnapshot = jobType === 'moving' ? buildPricingSnapshotForStorage(payload) : {};
    const rawTruckSize = payload.truckSize ?? payload.truckSizeCount ?? payload.vehicleSize ?? payload.truckType ?? null;
    const normalizedTruckSize = normalizeTruckSize(rawTruckSize);

    const hourlyRate = Number(payload.hourlyRate ?? payload.rate ?? pricingSnapshot.hourlyRate ?? 0);
    const minimumChargeHours = Number(pricingSnapshot.minimumChargeHours ?? payload.minimumChargeHours ?? payload.minimumHours ?? payload.minimumDuration ?? payload.estimatedHours ?? 2.5);
    const calloutTimeMinutes = Number(pricingSnapshot.calloutTimeMinutes ?? payload.calloutTimeMinutes ?? payload.calloutTime ?? ((Number(payload.callOutTimeHr ?? 0) * 60) + Number(payload.callOutTimeMin ?? 0)));
    const travelBackTimeMinutes = Number(pricingSnapshot.travelBackTimeMinutes ?? payload.travelBackTimeMinutes ?? payload.travelBackMinutes ?? ((Number(payload.travelBackTimeHr ?? 0) * 60) + Number(payload.travelBackTimeMin ?? 0)));
    const minimumLaborCost = Number(pricingSnapshot.minimumLaborCost ?? 0);
    const calloutCharge = Number(pricingSnapshot.calloutCharge ?? 0);
    const travelBackCharge = Number(pricingSnapshot.travelBackCharge ?? 0);
    const minimumEstimatedCost = Number(pricingSnapshot.minimumEstimatedCost ?? 0);

    const lineItems = normalizeLineItemsValue(payload.lineItems ?? payload.lineItemsText ?? payload.itemList ?? payload.items ?? payload.inventory ?? '');

    const quotationEmailAttachmentIds = normalizeAttachmentIds(payload.quotationEmailAttachments);
    const bookingConfirmationEmailAttachmentIds = normalizeAttachmentIds(payload.bookingConfirmationEmailAttachments);
    const selectedEmailAttachmentIds = Array.from(new Set([
      ...normalizeAttachmentIds(payload.selectedEmailAttachments),
      ...quotationEmailAttachmentIds,
      ...bookingConfirmationEmailAttachmentIds,
    ]));
    const emailAttachmentOptions = {
      quotation: payload.emailAttachmentOptions?.quotation !== false,
      bookingConfirmation: Boolean(payload.emailAttachmentOptions?.bookingConfirmation),
    };

    const creatorRole = isSuperAdmin(req.user) ? 'super_admin' : (req.user?.role || payload.createdByRole || 'admin');
    const createdBy = req.user?._id || req.user?.id || payload.createdBy || null;
    const createdByName = req.user?.name || payload.createdByName || (isSuperAdmin(req.user) ? 'Super Admin' : 'Admin');

    const jobData = {
      ...payload,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      createdBy,
      createdByRole: creatorRole,
      createdByName,
      lineItems,
      propertySize: payload.propertySize ?? payload.sizeOfProperty ?? payload.bedrooms ?? payload.houseSize ?? payload.moveSize ?? '',
      minimumChargeHours: Number.isFinite(minimumChargeHours) && minimumChargeHours >= 0 ? minimumChargeHours : 2.5,
      calloutTimeMinutes: Number.isFinite(calloutTimeMinutes) && calloutTimeMinutes >= 0 ? calloutTimeMinutes : 0,
      calloutCharge: Number.isFinite(calloutCharge) && calloutCharge >= 0 ? calloutCharge : 0,
      travelBackTimeMinutes: Number.isFinite(travelBackTimeMinutes) && travelBackTimeMinutes >= 0 ? travelBackTimeMinutes : 0,
      travelBackCharge: Number.isFinite(travelBackCharge) && travelBackCharge >= 0 ? travelBackCharge : 0,
      truckSize: normalizedTruckSize,
      truckSizeCount: undefined,
      movers: payload.movers ?? payload.numberOfMovers ?? payload.moverCount ?? null,
      callOutFee: payload.callOutFee ?? payload.calloutFee ?? payload.callOutCharge ?? null,
      callOutTimeHr: payload.callOutTimeHr ?? payload.calloutHours ?? 0,
      callOutTimeMin: payload.callOutTimeMin ?? payload.calloutMinutes ?? 0,
      travelBackFee: payload.travelBackFee ?? payload.travelBackCharge ?? null,
      travelBackTimeHr: payload.travelBackTimeHr ?? payload.travelBackHours ?? 0,
      travelBackTimeMin: payload.travelBackTimeMin ?? payload.travelBackMinutes ?? 0,
      stairsFee: payload.stairsFee ?? payload.stairsCharge ?? null,
      stairsCharge: Number.isFinite(Number(pricingSnapshot.stairsCharge ?? payload.stairsCharge ?? payload.stairsFee)) ? Number(pricingSnapshot.stairsCharge ?? payload.stairsCharge ?? payload.stairsFee) : 0,
      scheduleMode,
      scheduledTime: scheduleMode === 'window' ? null : payload.scheduledTime ?? payload.time ?? payload.scheduledAtTime ?? null,
      scheduledStartTime: scheduleMode === 'window' ? payload.scheduledStartTime ?? payload.startTime ?? payload.scheduledFrom ?? null : null,
      scheduledEndTime: scheduleMode === 'window' ? payload.scheduledEndTime ?? payload.endTime ?? payload.scheduledTo ?? null : null,
      pricingType,
      pricingSnapshot,
      includeGST: Boolean(payload.includeGST),
      gstRate: payload.gstRate !== undefined && payload.gstRate !== null && payload.gstRate !== '' ? Number(payload.gstRate) : 10,
      hourlyRate: jobType === 'moving' ? hourlyRate : 0,
      minimumLaborCost: jobType === 'moving' ? minimumLaborCost : 0,
      minimumEstimatedCost: jobType === 'moving' ? minimumEstimatedCost : 0,
      finalTotal: jobType === 'moving' ? pricingSnapshot.finalTotal : null,
      bookingDepositAmount: payload.bookingDepositAmount !== '' && payload.bookingDepositAmount !== null && payload.bookingDepositAmount !== undefined
        ? Number(payload.bookingDepositAmount)
        : null,
      selectedEmailAttachments: selectedEmailAttachmentIds,
      quotationEmailAttachments: quotationEmailAttachmentIds,
      bookingConfirmationEmailAttachments: bookingConfirmationEmailAttachmentIds,
      emailAttachmentOptions,
    };

    if (jobType === 'delivery') {
      delete jobData.truckSizeCount;
      delete jobData.hourlyRate;
      delete jobData.minimumChargeHours;
      delete jobData.minimumLaborCost;
      delete jobData.minimumEstimatedCost;
      delete jobData.calloutTimeMinutes;
      delete jobData.calloutCharge;
      delete jobData.travelBackTimeMinutes;
      delete jobData.travelBackCharge;
      delete jobData.pricingType;
    }

    if (normalizedEmail) {
      payload.customerEmail = normalizedEmail;
    } else if (typeof payload.customerEmail === 'string' && payload.customerEmail.trim() === '') {
      payload.customerEmail = undefined;
    }

    const shouldSendQuotationEmail = toBoolean(payload.sendQuotationEmail);
    const shouldSendBookingConfirmationEmail = toBoolean(payload.sendBookingConfirmationEmail);
    const anyEmailRequested = shouldSendQuotationEmail || shouldSendBookingConfirmationEmail;

    if (anyEmailRequested && !payload.customerEmail) {
      return sendError(res, 400, 'Customer email is required to send email communication');
    }

    if (anyEmailRequested) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(payload.customerEmail)) {
        return sendError(res, 400, 'Please provide a valid customer email address');
      }
    }

    if (shouldSendBookingConfirmationEmail && (!Number.isFinite(bookingDepositAmount) || bookingDepositAmount <= 0)) {
      return sendError(res, 400, 'A valid booking deposit amount is required when sending booking confirmation email');
    }

    console.log('[create-job] validation complete', { durationMs: Date.now() - createJobStartedAt });

    const rawBookingStatus = payload.bookingStatus ?? payload.bookingStage ?? payload.jobStage ?? payload.stage ?? payload.role;
    const isExplicitConfirmed = String(rawBookingStatus || '').trim().toLowerCase() === 'confirmed';
    const isExplicitQuotation = String(rawBookingStatus || '').trim().toLowerCase() === 'quotation';

    let bookingStatus = 'quotation';
    if (isExplicitConfirmed) {
      bookingStatus = 'confirmed';
    } else if (isExplicitQuotation) {
      bookingStatus = 'quotation';
    } else if (payload.sendBookingConfirmationEmail && !payload.sendQuotationEmail) {
      bookingStatus = 'confirmed';
    }

    jobData.bookingStatus = bookingStatus;
    jobData.quotation = {
      status: shouldSendQuotationEmail ? 'sent' : 'draft',
      sentAt: null,
      viewedAt: null,
      expiresAt: null,
      acceptedAt: bookingStatus === 'confirmed' ? new Date() : null,
      rejectedAt: null,
    };
    jobData.confirmation = {
      confirmedAt: bookingStatus === 'confirmed' ? new Date() : null,
      confirmedBy: bookingStatus === 'confirmed' ? req.user?._id : null,
      emailSent: false,
      emailSentAt: null,
      messageId: null,
      error: null,
    };

    jobData.bookingDepositAmount = shouldSendBookingConfirmationEmail ? bookingDepositAmount : null;
    jobData.customerEmail = payload.customerEmail;
    jobData.sendQuotationEmail = shouldSendQuotationEmail;
    jobData.sendBookingConfirmationEmail = shouldSendBookingConfirmationEmail;

    // Driver Price Visibility Calculation
    const finalCustomerPrice = getCustomerJobTotal(pricingSnapshot, payload);
    const driverPriceConfig = resolveDriverPrice(payload, finalCustomerPrice);
    Object.assign(jobData, driverPriceConfig);

    // Use model-level jobNumber generation (pre 'save') and retry on duplicate-key
    let job = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        job = await Job.create(jobData);
        break;
      } catch (error) {
        lastError = error;
        if (error?.code === 11000 && String(error.message).includes('jobNumber')) {
          // Duplicate jobNumber — retry to let model re-generate
          continue;
        }
        throw error;
      }
    }
    if (!job) throw lastError;
    const createAction = bookingStatus === 'confirmed' ? 'Job Created (Confirmed Booking)' : 'Quotation Created';
    job.timeline.push({ action: createAction, performedBy: req.user._id });
    await job.save();

    console.log('[create-job] database save complete', {
      jobId: job._id,
      bookingStatus: job.bookingStatus,
      durationMs: Date.now() - createJobStartedAt,
    });

    sendResponse(res, 201, {
      job: normalizeJobForResponse(job),
      emailStatus: {
        quotationSent: false,
        confirmationSent: false,
        errors: [],
      },
      emails: {
        quotation: { requested: shouldSendQuotationEmail, sent: false, error: null },
        bookingConfirmation: { requested: shouldSendBookingConfirmationEmail, sent: false, error: null },
      },
    }, bookingStatus === 'confirmed' ? 'Confirmed booking created successfully.' : 'Quotation created successfully.');
    console.log('[create-job] response sent', {
      jobId: job._id,
      durationMs: Date.now() - createJobStartedAt,
    });
    console.timeEnd('create-job-backend');

    setImmediate(() => {
      (async () => {
        console.time('create-job-post-create-operations');
        console.log('[create-job] post-create email/PDF/attachment operations started', { jobId: job._id });

        const savedJob = await Job.findById(job._id).lean();
        console.log('SAVED_JOB_EMAIL_DATA_DEBUG', {
          jobId: savedJob?._id,
          jobReference: savedJob?.jobNumber,
          jobType: savedJob?.jobType,
          customerName: savedJob?.customerName,
          customerEmail: savedJob?.customerEmail,
          propertySize: savedJob?.propertySize,
          itemList: savedJob?.itemList,
          pickupAddress: savedJob?.pickupAddress,
          dropoffAddress: savedJob?.dropAddress,
          scheduledDate: savedJob?.scheduledDate,
          scheduledTime: savedJob?.scheduledTime,
          truckSizeCount: savedJob?.truckSizeCount,
          movers: savedJob?.movers,
          hourlyRate: savedJob?.hourlyRate,
          callOutFee: savedJob?.callOutFee,
          callOutTimeMin: savedJob?.callOutTimeMin,
          travelBackFee: savedJob?.travelBackFee,
          travelBackTimeMin: savedJob?.travelBackTimeMin,
          minimumEstimatedCost: savedJob?.minimumEstimatedCost,
          quotationEmail: savedJob?.sendQuotationEmail,
        });

        const emailResults = {
          quotation: { requested: shouldSendQuotationEmail, sent: false, error: null },
          bookingConfirmation: { requested: shouldSendBookingConfirmationEmail, sent: false, error: null },
        };

        const createAttachmentSnapshot = async (jobRecord) => {
          const attachmentIds = Array.isArray(jobRecord?.selectedEmailAttachments) && jobRecord.selectedEmailAttachments.length > 0
            ? jobRecord.selectedEmailAttachments
            : [
              ...(Array.isArray(jobRecord?.quotationEmailAttachments) ? jobRecord.quotationEmailAttachments : []),
              ...(Array.isArray(jobRecord?.bookingConfirmationEmailAttachments) ? jobRecord.bookingConfirmationEmailAttachments : []),
            ];
          if (attachmentIds.length === 0) return [];
          const attachments = await EmailAttachment.find({ _id: { $in: attachmentIds }, isActive: true }).lean();
          return attachments.map((attachment) => ({
            attachmentId: attachment._id,
            name: attachment.name,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize,
          }));
        };

        const emailErrors = [];

        if (shouldSendQuotationEmail) {
          try {
            const freshJob = savedJob;
            const quotationStartedAt = Date.now();
            const quotationAttachmentIds = Array.from(new Set([
              ...(Array.isArray(freshJob?.quotationEmailAttachments) ? freshJob.quotationEmailAttachments : []),
              ...(Array.isArray(freshJob?.selectedEmailAttachments) ? freshJob.selectedEmailAttachments : []),
            ]));
            const attachments = emailAttachmentOptions.quotation
              ? await buildEmailAttachments(quotationAttachmentIds)
              : [];
            const result = await sendQuotationEmail({ job: freshJob, to: savedJob.customerEmail, attachments });
            console.log('[create-job] quotation email operations complete', {
              jobId: job._id,
              durationMs: Date.now() - quotationStartedAt,
              attachmentCount: attachments.length,
            });
            emailResults.quotation.sent = result.sent;
            job.quotationSent = true;
            job.quotationSentAt = new Date();
            job.quotation = job.quotation || {};
            job.quotation.status = 'sent';
            job.quotation.sentAt = new Date();
          } catch (error) {
            console.error('Quotation email failed', {
              jobId: job._id,
              jobNumber: job.jobNumber,
              recipient: job.customerEmail,
              message: error.message,
              code: error.code,
            });
            emailResults.quotation.error = 'Quotation email could not be sent';
            emailErrors.push('Unable to send quotation email');
            job.quotationSent = false;
          }
        }

        if (shouldSendBookingConfirmationEmail) {
          try {
            const confirmationStartedAt = Date.now();
            const confirmationAttachmentIds = Array.from(new Set([
              ...(Array.isArray(job?.bookingConfirmationEmailAttachments) ? job.bookingConfirmationEmailAttachments : []),
              ...(Array.isArray(job?.selectedEmailAttachments) ? job.selectedEmailAttachments : []),
            ]));
            const attachments = emailAttachmentOptions.bookingConfirmation
              ? await buildEmailAttachments(confirmationAttachmentIds)
              : [];
            const result = await sendBookingConfirmationEmail({ job: savedJob, to: job.customerEmail, bookingDepositAmount, attachments });
            console.log('[create-job] booking confirmation email operations complete', {
              jobId: job._id,
              durationMs: Date.now() - confirmationStartedAt,
              attachmentCount: attachments.length,
            });
            emailResults.bookingConfirmation.sent = result.sent;
            job.confirmationSent = true;
            job.confirmationSentAt = new Date();
            job.confirmation = job.confirmation || {};
            job.confirmation.emailSent = true;
            job.confirmation.emailSentAt = new Date();
            job.confirmation.messageId = result.messageId;
            job.confirmation.error = null;
          } catch (error) {
            console.error('Booking confirmation email failed', {
              jobId: job._id,
              jobNumber: job.jobNumber,
              recipient: job.customerEmail,
              message: error.message,
              code: error.code,
            });
            emailResults.bookingConfirmation.error = 'Booking confirmation email could not be sent';
            emailErrors.push('Unable to send booking confirmation email');
            job.confirmationSent = false;
            job.confirmation = job.confirmation || {};
            job.confirmation.emailSent = false;
            job.confirmation.error = error.message;
          }
        }

        if (emailErrors.length > 0) {
          job.timeline.push({ action: 'Email Notification Issue', performedBy: req.user._id, notes: emailErrors.join('; ') });
        }

        job.bookingDepositAmount = shouldSendBookingConfirmationEmail ? bookingDepositAmount : null;
        job.emailAttachmentOptions = emailAttachmentOptions;
        job.emailAttachmentSnapshot = await createAttachmentSnapshot(job);
        await job.save();

        console.log('[create-job] background email results persisted', {
          jobId: job._id,
          emailResults,
          errors: emailErrors,
        });
        console.log('[create-job] post-create email/PDF/attachment operations complete', {
          jobId: job._id,
          durationMs: Date.now() - createJobStartedAt,
        });
        console.timeEnd('create-job-post-create-operations');
      })().catch((error) => {
        console.error('[create-job] post-create operations failed', {
          jobId: job._id,
          message: error.message,
          stack: error.stack,
        });
      });
    });
    return;
  } catch (error) {
    next(error);
  }
};

export const getJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      sortBy,
      sortOrder,
    } = req.query;

    let sortOption = sort;
    if (sortBy) {
      const order = String(sortOrder || '').toLowerCase() === 'asc' ? '' : '-';
      sortOption = `${order}${sortBy}`;
    }

    const filter = buildJobFilterQuery(req.query, req.user);

    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .populate('assignedDrivers', 'name email phone')
        .populate('driverAssignments.driverId', 'name email phone')
        .populate('driverAssignments.assignedBy', 'name role')
        .populate('assignedVehicle', 'name type registration')
        .populate('createdBy', 'name email role')
        .skip((Math.max(1, Number(page)) - 1) * Number(limit))
        .limit(Number(limit))
        .sort(sortOption)
        .lean(),
    ]);

    sendResponse(res, 200, {
      jobs: jobs.map((job) => normalizeJobForResponse(job)),
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getJobsSummary = async (req, res, next) => {
  try {
    const filter = buildJobFilterQuery(req.query, req.user);
    const driverId = req.query.driverId || req.query.driver || null;
    const summary = await calculateJobSummaryStats(filter, driverId, req.user);
    sendResponse(res, 200, { summary });
  } catch (error) {
    next(error);
  }
};

export const exportJobsCsv = async (req, res, next) => {
  try {
    const filter = buildJobFilterQuery(req.query, req.user);
    const exportMode = req.query.exportMode === 'driver_sessions' || req.query.mode === 'driver_sessions' ? 'driver_sessions' : 'standard';

    const jobs = await Job.find(filter)
      .populate('assignedDrivers', 'name email phone')
      .populate('driverAssignments.driverId', 'name email phone')
      .populate('driverAssignments.assignedBy', 'name role')
      .populate('assignedVehicle', 'name type registration')
      .populate('createdBy', 'name email role')
      .sort(req.query.sort || '-scheduledDate')
      .lean();

    const csvContent = generateJobsCsv({
      jobs: jobs.map((job) => normalizeJobForResponse(job)),
      filterParams: req.query,
      reqUser: req.user,
      exportMode,
    });

    const filename = buildCsvExportFilename(req.query, exportMode);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

export const getJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('assignedDrivers', 'name email phone')
      .populate('driverAssignments.driverId', 'name email phone')
      .populate('driverAssignments.assignedBy', 'name role')
      .populate('assignedVehicle', 'name type registration')
      .populate('customerId', 'name email phone address')
      .populate('completedByDriverId', 'name email phone')
      .populate('timeline.performedBy', 'name role')
      .populate('createdBy', 'name email role')
      .populate('invoiceId');

    if (!job) return sendError(res, 404, 'Job not found.');

    // Enforce view_own restriction for single job fetch if applicable
    if (req.user && !isSuperAdmin(req.user)) {
      const userRole = String(req.user.role || '').toLowerCase();
      if (userRole === 'admin' || userRole === 'manager') {
        const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
        const canViewAll = userPerms.includes('*') || userPerms.includes('all') || userPerms.includes('jobs.view_all');
        const canViewOwn = userPerms.includes('jobs.view_own');
        if (!canViewAll && canViewOwn) {
          const creatorId = job.createdBy?._id || job.createdBy;
          if (String(creatorId) !== String(req.user._id)) {
            return sendError(res, 403, 'You do not have permission to view this job.');
          }
        }
      }
    }
    const isDriver = req.user?.role === 'driver';
    sendResponse(res, 200, { job: normalizeJobForResponse(job, { forDriver: isDriver, driverId: getDriverId(req.user) }) });
  } catch (error) {
    next(error);
  }
};

export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid job ID.');
    }

    const job = await Job.findById(id).select('_id jobNumber');
    if (!job) return sendError(res, 404, 'Job not found.');

    await Promise.all([
      Invoice.deleteMany({ jobId: job._id }),
      Notification.deleteMany({
        $or: [{ jobId: job._id }, { job: job._id }],
      }),
      ActivityLog.deleteMany({ entity: 'Job', entityId: job._id }),
      Job.deleteOne({ _id: job._id }),
    ]);

    return sendResponse(res, 200, {
      job: { _id: job._id, jobNumber: job.jobNumber },
    }, 'Job deleted successfully.');
  } catch (error) {
    next(error);
  }
};

export const deleteAllJobs = async (req, res, next) => {
  try {
    // Remove all jobs and related entities
    await Promise.all([
      Invoice.deleteMany({}),
      Notification.deleteMany({ $or: [{ jobId: { $exists: true } }, { job: { $exists: true } }] }),
      ActivityLog.deleteMany({ entity: 'Job' }),
      Job.deleteMany({}),
    ]);

    sendResponse(res, 200, {}, 'All jobs deleted successfully.');
  } catch (error) {
    next(error);
  }
};

export const updateJob = async (req, res, next) => {
  try {
    const existingJob = await Job.findById(req.params.id);
    if (!existingJob) return sendError(res, 404, 'Job not found.');
    if (getLockState(existingJob.status)) {
      return sendError(res, 400, getReadOnlyJobError(existingJob.status));
    }

    // Role-based ownership check for editing
    if (req.user && !isSuperAdmin(req.user)) {
      const userRole = String(req.user.role || '').toLowerCase();
      if (userRole === 'admin' || userRole === 'manager') {
        const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
        const canEditAll = userPerms.includes('*') || userPerms.includes('all') || userPerms.includes('jobs.edit_all') || userPerms.includes('jobs.edit');
        const canEditOwn = userPerms.includes('jobs.edit_own');
        if (!canEditAll && canEditOwn) {
          const creatorId = existingJob.createdBy?._id || existingJob.createdBy;
          if (creatorId && String(creatorId) !== String(req.user._id)) {
            return sendError(res, 403, 'You do not have permission to edit jobs created by other users.');
          }
        }
      }
    }

    if (req.body && req.body.priority === 'none') delete req.body.priority;
    if (req.body && req.body.jobNumber) delete req.body.jobNumber;

    const canonicalPickupAddress = resolvePickupAddress(req.body);
    const canonicalDropoffAddress = resolveDropoffAddress(req.body);
    if (canonicalPickupAddress) req.body.pickupAddress = canonicalPickupAddress;
    if (canonicalDropoffAddress) req.body.dropAddress = canonicalDropoffAddress;

    const jobType = normalizeJobType(req.body.jobType ?? existingJob.jobType);
    if (!['moving', 'delivery'].includes(jobType)) {
      return sendError(res, 400, 'Job type must be Moving or Delivery.');
    }
    const pricingType = String(req.body.pricingType ?? existingJob?.pricingType ?? 'hourly').trim().toLowerCase();
    if (!['hourly', 'fixed'].includes(pricingType)) {
      return sendError(res, 400, 'Pricing type must be hourly or fixed.');
    }
    const scheduleMode = resolveScheduleMode(req.body, existingJob);
    const pricingSnapshot = jobType === 'moving' ? buildPricingSnapshotForStorage({ ...existingJob.toObject(), ...req.body }) : {};
    const previousPaymentState = {
      paymentMethod: existingJob.paymentMethod,
      amountReceived: existingJob.amountReceived,
      paymentTransactionReference: existingJob.paymentTransactionReference,
      paymentProofUrl: existingJob.paymentProofUrl,
    };

    const truckSize = req.body.truckSize ?? req.body.truckSizeCount ?? req.body.vehicleSize ?? req.body.truckType ?? null;
    const normalizedTruckSize = normalizeTruckSize(truckSize);
    const hourlyRate = Number(req.body.hourlyRate ?? req.body.rate ?? existingJob.hourlyRate ?? 0);
    const minimumChargeHours = Number(req.body.minimumChargeHours ?? req.body.minimumHours ?? req.body.minimumDuration ?? existingJob.minimumChargeHours ?? existingJob.minimumHours ?? 2.5);
    const calloutTimeMinutes = Number(req.body.calloutTimeMinutes ?? req.body.calloutTime ?? ((Number(req.body.callOutTimeHr ?? existingJob.callOutTimeHr ?? 0) * 60) + Number(req.body.callOutTimeMin ?? existingJob.callOutTimeMin ?? 0)));
    const travelBackTimeMinutes = Number(req.body.travelBackTimeMinutes ?? req.body.travelBackMinutes ?? ((Number(req.body.travelBackTimeHr ?? existingJob.travelBackTimeHr ?? 0) * 60) + Number(req.body.travelBackTimeMin ?? existingJob.travelBackTimeMin ?? 0)));
    const minimumLaborCost = Math.round((hourlyRate * minimumChargeHours + Number.EPSILON) * 100) / 100;
    const calloutCharge = Math.round(((hourlyRate / 60) * calloutTimeMinutes + Number.EPSILON) * 100) / 100;
    const travelBackCharge = Math.round(((hourlyRate / 60) * travelBackTimeMinutes + Number.EPSILON) * 100) / 100;
    const minimumEstimatedCost = Math.round((minimumLaborCost + calloutCharge + travelBackCharge + Number.EPSILON) * 100) / 100;
    const lineItems = normalizeLineItemsValue(req.body.lineItems ?? req.body.lineItemsText ?? req.body.itemList ?? req.body.items ?? req.body.inventory ?? '');

    const jobData = {
      ...req.body,
      jobType,
      createdBy: existingJob.createdBy,
      createdByRole: existingJob.createdByRole,
      createdByName: existingJob.createdByName,
      updatedBy: req.user?._id || req.user?.id,
      updatedByName: req.user?.name || (isSuperAdmin(req.user) ? 'Super Admin' : 'Admin'),
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      customerEmail: req.body.customerEmail,
      lineItems,
      propertySize: req.body.propertySize ?? req.body.sizeOfProperty ?? req.body.bedrooms ?? req.body.houseSize ?? req.body.moveSize ?? '',
      minimumChargeHours: Number.isFinite(minimumChargeHours) && minimumChargeHours >= 0 ? minimumChargeHours : 2.5,
      calloutTimeMinutes: Number.isFinite(calloutTimeMinutes) && calloutTimeMinutes >= 0 ? calloutTimeMinutes : 0,
      calloutCharge: Number.isFinite(calloutCharge) && calloutCharge >= 0 ? calloutCharge : 0,
      travelBackTimeMinutes: Number.isFinite(travelBackTimeMinutes) && travelBackTimeMinutes >= 0 ? travelBackTimeMinutes : 0,
      travelBackCharge: Number.isFinite(travelBackCharge) && travelBackCharge >= 0 ? travelBackCharge : 0,
      truckSize: normalizedTruckSize,
      truckSizeCount: undefined,
      scheduleMode,
      scheduledTime: scheduleMode === 'window' ? null : req.body.scheduledTime ?? req.body.time ?? existingJob.scheduledTime ?? null,
      scheduledStartTime: scheduleMode === 'window' ? req.body.scheduledStartTime ?? req.body.startTime ?? req.body.scheduledFrom ?? existingJob.scheduledStartTime ?? null : null,
      scheduledEndTime: scheduleMode === 'window' ? req.body.scheduledEndTime ?? req.body.endTime ?? req.body.scheduledTo ?? existingJob.scheduledEndTime ?? null : null,
      movers: req.body.movers ?? req.body.numberOfMovers ?? req.body.moverCount ?? null,
      callOutFee: req.body.callOutFee ?? req.body.calloutFee ?? req.body.callOutCharge ?? null,
      callOutTimeHr: req.body.callOutTimeHr ?? req.body.calloutHours ?? 0,
      callOutTimeMin: req.body.callOutTimeMin ?? req.body.calloutMinutes ?? 0,
      travelBackFee: req.body.travelBackFee ?? req.body.travelBackCharge ?? null,
      travelBackTimeHr: req.body.travelBackTimeHr ?? req.body.travelBackHours ?? 0,
      travelBackTimeMin: req.body.travelBackTimeMin ?? req.body.travelBackMinutes ?? 0,
      stairsFee: req.body.stairsFee ?? req.body.stairsCharge ?? existingJob.stairsFee ?? null,
      stairsCharge: Number.isFinite(Number(pricingSnapshot.stairsCharge ?? req.body.stairsCharge ?? req.body.stairsFee ?? existingJob.stairsCharge)) ? Number(pricingSnapshot.stairsCharge ?? req.body.stairsCharge ?? req.body.stairsFee ?? existingJob.stairsCharge) : 0,
      pricingType,
      pricingSnapshot,
      includeGST: req.body.includeGST !== undefined ? Boolean(req.body.includeGST) : existingJob.includeGST,
      gstRate: req.body.gstRate !== undefined && req.body.gstRate !== null && req.body.gstRate !== '' ? Number(req.body.gstRate) : (existingJob.gstRate ?? 10),
      hourlyRate: jobType === 'moving' ? hourlyRate : 0,
      minimumLaborCost: jobType === 'moving' ? minimumLaborCost : 0,
      minimumEstimatedCost: jobType === 'moving' ? minimumEstimatedCost : 0,
      finalTotal: jobType === 'moving' ? pricingSnapshot.finalTotal : null,
      bookingDepositAmount: req.body.bookingDepositAmount !== '' && req.body.bookingDepositAmount !== null && req.body.bookingDepositAmount !== undefined
        ? Number(req.body.bookingDepositAmount)
        : null,
    };

    if (jobType === 'delivery') {
      delete jobData.truckSizeCount;
      delete jobData.hourlyRate;
      delete jobData.minimumChargeHours;
      delete jobData.minimumLaborCost;
      delete jobData.minimumEstimatedCost;
      delete jobData.calloutTimeMinutes;
      delete jobData.calloutCharge;
      delete jobData.travelBackTimeMinutes;
      delete jobData.travelBackCharge;
      delete jobData.pricingType;
    }

    if (jobType === 'delivery') {
      Object.assign(jobData, {
        hourlyRate: null,
        fixedPrice: null,
        estimatedHours: null,
        truckSizeCount: null,
        movers: null,
        callOutFee: null,
        callOutTimeHr: null,
        callOutTimeMin: null,
        travelBackFee: null,
        travelBackTimeHr: null,
        travelBackTimeMin: null,
        discount: null,
        pricingType: null,
        pricingSnapshot: {},
        minimumEstimatedCost: null,
        minimumLaborCost: null,
        finalTotal: null,
      });
    }

    // Driver Price Visibility Calculation
    const finalCustomerPrice = getCustomerJobTotal(pricingSnapshot, {
      ...existingJob.toObject(),
      ...req.body,
    });

    const driverPricePayload = {
      showDriverPrice: req.body.showDriverPrice !== undefined ? req.body.showDriverPrice : existingJob.showDriverPrice,
      driverPriceType: req.body.driverPriceType !== undefined ? req.body.driverPriceType : existingJob.driverPriceType,
      driverPrice: req.body.driverPrice !== undefined ? req.body.driverPrice : existingJob.driverPrice,
      driverPricePercentage: req.body.driverPricePercentage !== undefined ? req.body.driverPricePercentage : existingJob.driverPricePercentage,
    };
    const driverPriceConfig = resolveDriverPrice(driverPricePayload, finalCustomerPrice);
    const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';
    const shouldSendQuotationEmail = toBoolean(req.body.sendQuotationEmail);
    const shouldSendBookingConfirmationEmail = toBoolean(req.body.sendBookingConfirmationEmail);
    const anyEmailRequested = shouldSendQuotationEmail || shouldSendBookingConfirmationEmail;

    if (anyEmailRequested && !jobData.customerEmail) {
      return sendError(res, 400, 'Customer email is required to send email communication');
    }

    if (anyEmailRequested) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(jobData.customerEmail)) {
        return sendError(res, 400, 'Please provide a valid customer email address');
      }
    }

    const bookingDepositAmount = req.body.bookingDepositAmount !== '' && req.body.bookingDepositAmount !== null && req.body.bookingDepositAmount !== undefined
      ? Number(req.body.bookingDepositAmount)
      : (existingJob.bookingDepositAmount || 50);

    if (shouldSendBookingConfirmationEmail && (!Number.isFinite(bookingDepositAmount) || bookingDepositAmount <= 0)) {
      return sendError(res, 400, 'A valid booking deposit amount is required when sending booking confirmation email');
    }

    const emailAttachmentOptions = req.body.emailAttachmentOptions || {
      quotation: true,
      bookingConfirmation: true,
    };

    jobData.sendQuotationEmail = shouldSendQuotationEmail;
    jobData.sendBookingConfirmationEmail = shouldSendBookingConfirmationEmail;
    if (req.body.quotationEmailAttachments !== undefined) {
      jobData.quotationEmailAttachments = req.body.quotationEmailAttachments;
    }
    if (req.body.bookingConfirmationEmailAttachments !== undefined) {
      jobData.bookingConfirmationEmailAttachments = req.body.bookingConfirmationEmailAttachments;
    }
    if (req.body.selectedEmailAttachments !== undefined) {
      jobData.selectedEmailAttachments = req.body.selectedEmailAttachments;
    }

    if (shouldSendQuotationEmail) {
      jobData.quotation = {
        ...(existingJob.quotation ? existingJob.quotation.toObject?.() || existingJob.quotation : {}),
        status: 'sent',
        sentAt: new Date(),
      };
      jobData.quotationSent = true;
      jobData.quotationSentAt = new Date();
    }

    if (shouldSendBookingConfirmationEmail) {
      jobData.confirmation = {
        ...(existingJob.confirmation ? existingJob.confirmation.toObject?.() || existingJob.confirmation : {}),
        emailSent: true,
        emailSentAt: new Date(),
        error: null,
      };
      jobData.confirmationSent = true;
      jobData.confirmationSentAt = new Date();
      jobData.bookingDepositAmount = bookingDepositAmount;
    }

    const job = await Job.findByIdAndUpdate(req.params.id, jobData, {
      new: true,
      runValidators: true,
    });
    if (!job) return sendError(res, 404, 'Job not found.');

    const createAttachmentSnapshot = async (jobRecord) => {
      const attachmentIds = Array.isArray(jobRecord?.selectedEmailAttachments) && jobRecord.selectedEmailAttachments.length > 0
        ? jobRecord.selectedEmailAttachments
        : [
          ...(Array.isArray(jobRecord?.quotationEmailAttachments) ? jobRecord.quotationEmailAttachments : []),
          ...(Array.isArray(jobRecord?.bookingConfirmationEmailAttachments) ? jobRecord.bookingConfirmationEmailAttachments : []),
        ];
      if (attachmentIds.length === 0) return [];
      const attachments = await EmailAttachment.find({ _id: { $in: attachmentIds }, isActive: true }).lean();
      return attachments.map((attachment) => ({
        attachmentId: attachment._id,
        name: attachment.name,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
      }));
    };

    if (anyEmailRequested) {
      job.timeline.push({
        action: 'Job Updated & Email Resent',
        performedBy: req.user?._id || null,
        notes: [
          shouldSendQuotationEmail ? 'Quotation email requested on update' : null,
          shouldSendBookingConfirmationEmail ? 'Booking confirmation email requested on update' : null,
        ].filter(Boolean).join('; '),
      });
      job.emailAttachmentOptions = emailAttachmentOptions;
      job.emailAttachmentSnapshot = await createAttachmentSnapshot(job);
      await job.save();
    }

    const paymentChanged = [
      'paymentMethod',
      'amountReceived',
      'paymentTransactionReference',
      'paymentProofUrl',
    ].some((field) => String(existingJob[field]) !== String(job[field]));

    if (paymentChanged && job.assignedDrivers?.length > 0) {
      const notificationPromises = job.assignedDrivers.map((driverId) => createAndSendDriverNotification({
        driverId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment Updated',
        message: 'Payment information for your assigned job has been updated.',
        jobId: job._id,
        data: {
          type: 'PAYMENT_RECEIVED',
          jobId: String(job._id),
          screen: 'JobDetail',
        },
        deduplicationKey: `PAYMENT_UPDATED:${job._id}:${String(driverId)}:${job.updatedAt?.toISOString?.() || new Date().toISOString()}`,
      }).catch((error) => console.error('Payment notification dispatch failed', { message: error.message, code: error.code })));

      await Promise.allSettled(notificationPromises);
    }

    sendResponse(res, 200, {
      job: normalizeJobForResponse(job),
      emailStatus: {
        quotationSent: false,
        confirmationSent: false,
        errors: [],
      },
      emails: {
        quotation: { requested: shouldSendQuotationEmail, sent: false, error: null },
        bookingConfirmation: { requested: shouldSendBookingConfirmationEmail, sent: false, error: null },
      },
    }, 'Job updated.');

    if (anyEmailRequested) {
      setImmediate(() => {
        (async () => {
          try {
            const savedJob = await Job.findById(job._id).lean();
            if (!savedJob) return;

            const emailErrors = [];

            if (shouldSendQuotationEmail) {
              try {
                const quotationAttachmentIds = Array.from(new Set([
                  ...(Array.isArray(savedJob?.quotationEmailAttachments) ? savedJob.quotationEmailAttachments : []),
                  ...(Array.isArray(savedJob?.selectedEmailAttachments) ? savedJob.selectedEmailAttachments : []),
                ]));
                const attachments = emailAttachmentOptions.quotation
                  ? await buildEmailAttachments(quotationAttachmentIds)
                  : [];
                await sendQuotationEmail({ job: savedJob, to: savedJob.customerEmail, attachments });
                console.log('[update-job] quotation email sent successfully', { jobId: job._id });
              } catch (err) {
                console.error('[update-job] quotation email failed', { jobId: job._id, error: err.message });
                emailErrors.push(`Unable to send quotation email: ${err.message}`);
              }
            }

            if (shouldSendBookingConfirmationEmail) {
              try {
                const confirmationAttachmentIds = Array.from(new Set([
                  ...(Array.isArray(savedJob?.bookingConfirmationEmailAttachments) ? savedJob.bookingConfirmationEmailAttachments : []),
                  ...(Array.isArray(savedJob?.selectedEmailAttachments) ? savedJob.selectedEmailAttachments : []),
                ]));
                const attachments = emailAttachmentOptions.bookingConfirmation
                  ? await buildEmailAttachments(confirmationAttachmentIds)
                  : [];
                await sendBookingConfirmationEmail({
                  job: savedJob,
                  to: savedJob.customerEmail,
                  bookingDepositAmount,
                  attachments,
                });
                console.log('[update-job] booking confirmation email sent successfully', { jobId: job._id });
              } catch (err) {
                console.error('[update-job] booking confirmation email failed', { jobId: job._id, error: err.message });
                emailErrors.push(`Unable to send booking confirmation email: ${err.message}`);
              }
            }

            if (emailErrors.length > 0) {
              await Job.findByIdAndUpdate(job._id, {
                $push: {
                  timeline: {
                    action: 'Email Notification Issue',
                    performedBy: req.user?._id || null,
                    notes: emailErrors.join('; '),
                  },
                },
              });
            }
          } catch (err) {
            console.error('[update-job] background email processing error', err);
          }
        })();
      });
    }
  } catch (error) {
    next(error);
  }
};

export const assignDrivers = async (req, res, next) => {
  try {
    const { driverIds, vehicleId } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (getLockState(job.status)) {
      return sendError(res, 400, getReadOnlyJobError(job.status));
    }

    const previousAssignedDrivers = (job.assignedDrivers || []).map((driver) => String(driver?._id || driver));
    const normalizedDriverIds = Array.isArray(driverIds) ? driverIds.map((driver) => String(driver?._id || driver)).filter(Boolean) : [];

    job.assignedDrivers = normalizedDriverIds;
    if (vehicleId) job.assignedVehicle = vehicleId;
    job.status = 'assigned';

    if (!Array.isArray(job.driverAssignments)) job.driverAssignments = [];

    // Ensure driverAssignments reflects assigned drivers
    normalizedDriverIds.forEach((driverId, idx) => {
      const existingAssignment = job.driverAssignments.find(
        (a) => String(a.driverId?._id || a.driverId) === String(driverId)
      );
      if (existingAssignment) {
        if (existingAssignment.status === 'removed') {
          existingAssignment.status = existingAssignment.startedAt ? 'in_progress' : 'assigned';
          existingAssignment.removedAt = null;
        }
      } else {
        job.driverAssignments.push({
          driverId,
          role: idx === 0 && job.driverAssignments.length === 0 ? 'Lead Driver' : 'Driver',
          assignedAt: new Date(),
          assignedBy: req.user?._id || null,
          status: 'assigned',
          startedAt: null,
          completedAt: null,
          totalWorkedMinutes: 0,
          startAgreement: null,
        });
      }
    });

    // Mark unassigned drivers as removed if not already
    job.driverAssignments.forEach((assignment) => {
      const aDriverId = String(assignment.driverId?._id || assignment.driverId);
      if (!normalizedDriverIds.includes(aDriverId)) {
        if (assignment.status !== 'removed') {
          assignment.status = 'removed';
          assignment.removedAt = new Date();
        }
      }
    });

    job.timeline.push({
      action: 'Drivers Assigned',
      performedBy: req.user._id,
      notes: `Assigned ${normalizedDriverIds.length} driver(s)`,
    });
    await job.save();

    await Driver.updateMany(
      { userId: { $in: normalizedDriverIds } },
      { availability: 'busy' }
    );

    const driversToNotify = normalizedDriverIds.filter((driverId) => !previousAssignedDrivers.includes(driverId));
    const notificationResults = [];
    for (const driverId of driversToNotify) {
      const result = await createAndSendDriverNotification({
        driverId,
        type: 'NEW_JOB',
        title: 'New job assigned',
        message: `${job.jobNumber || 'JOB'} • Pickup → Drop-off`,
        jobId: job._id,
        data: {
          type: 'NEW_JOB',
          jobId: String(job._id),
          screen: 'JobDetail',
        },
        deduplicationKey: `JOB_ASSIGNED:${job._id}:${driverId}:${job.updatedAt?.toISOString?.() || new Date().toISOString()}`,
      }).catch((error) => {
        console.error('Job assignment notification dispatch failed', { message: error.message, code: error.code });
        return { status: 'failed', reason: error.message };
      });
      notificationResults.push({ driverId, result });
    }

    const populated = await Job.findById(job._id)
      .populate('assignedDrivers', 'name email phone')
      .populate('driverAssignments.driverId', 'name email phone')
      .populate('driverAssignments.assignedBy', 'name role')
      .populate('assignedVehicle', 'name type registration');

    const pushSummary = notificationResults.reduce((summary, item) => {
      const status = item.result?.status || 'failed';
      if (status === 'sent' || status === 'partial') summary.sent += 1;
      if (status === 'no_device') summary.noDevice += 1;
      if (status === 'failed' || status === 'skipped') summary.failed += 1;
      return summary;
    }, { sent: 0, failed: 0, noDevice: 0 });

    const message = pushSummary.sent > 0
      ? `Job assigned successfully. Push notification sent to ${pushSummary.sent} driver${pushSummary.sent > 1 ? 's' : ''}.`
      : pushSummary.noDevice > 0
        ? 'Job assigned successfully. Driver has no registered notification device.'
        : 'Job assigned successfully. Push notification could not be sent.';

    sendResponse(res, 200, { job: populated, push: pushSummary }, message);
  } catch (error) {
    next(error);
  }
};

export const cancelJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (getLockState(job.status)) {
      return sendError(res, 400, getReadOnlyJobError(job.status));
    }

    job.status = 'cancelled';
    job.timeline.push({ action: 'Job Cancelled', performedBy: req.user._id, notes: req.body.reason });
    await job.save();

    // Free up drivers
    if (job.assignedDrivers.length > 0) {
      await Driver.updateMany(
        { userId: { $in: job.assignedDrivers } },
        { availability: 'available' }
      );
    }

    const notificationResults = [];
    for (const driverId of job.assignedDrivers || []) {
      const result = await createAndSendDriverNotification({
        driverId,
        type: 'JOB_CANCELLED',
        title: 'Job cancelled',
        message: `${job.jobNumber || 'JOB'} has been cancelled.`,
        jobId: job._id,
        data: {
          type: 'JOB_CANCELLED',
          jobId: String(job._id),
          screen: 'JobDetail',
        },
        deduplicationKey: `JOB_CANCELLED:${job._id}:${driverId}`,
      }).catch((error) => {
        console.error('Job cancellation notification dispatch failed', { message: error.message, code: error.code });
        return { status: 'failed', reason: error.message };
      });
      notificationResults.push({ driverId, result });
    }

    sendResponse(res, 200, { job, push: notificationResults }, 'Job cancelled.');
  } catch (error) {
    next(error);
  }
};

// Driver workflow endpoints
export const acceptJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');
    if (!validateJobTransition(job.status, 'accepted')) return sendError(res, 400, 'Job cannot be accepted in current status.');

    job.status = 'accepted';
    job.timeline.push({ action: 'Job Accepted', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Job accepted.');
  } catch (error) {
    next(error);
  }
};

export const startTransit = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');
    if (!validateJobTransition(job.status, 'inTransit')) {
      return sendError(res, 400, 'Job must be assigned or accepted before starting transit.');
    }

    job.status = 'inTransit';
    job.timeline.push({ action: 'Transit Started', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Transit started.');
  } catch (error) {
    next(error);
  }
};

export const arrivedAtLocation = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');
    if (!validateJobTransition(job.status, 'arrived')) return sendError(res, 400, 'Must be in transit to mark arrival.');

    job.status = 'arrived';
    job.timeline.push({ action: 'Arrived at Location', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Arrived at location.');
  } catch (error) {
    next(error);
  }
};

export const startJob = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    const driverId = getDriverId(req.user);
    const isAssigned = (job.assignedDrivers || []).some((driver) => {
      const assignedId = driver?._id || driver;
      return String(assignedId) === driverId;
    });

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this job',
      });
    }

    console.log('Start job request:', {
      jobId,
      driverId,
      previousStatus: job?.status,
      previousStartedAt: job?.startedAt,
    });

    if (job.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cancelled jobs cannot be started',
      });
    }

    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Job is already completed',
      });
    }

    if (!Array.isArray(job.driverAssignments)) job.driverAssignments = [];
    let assignment = job.driverAssignments.find(
      (a) => String(a.driverId?._id || a.driverId) === driverId
    );

    if (assignment && assignment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Your work session for this job is already completed',
      });
    }

    if (assignment && assignment.startedAt) {
      return res.status(200).json({
        success: true,
        message: 'Your work session is already started',
        job: normalizeJobForResponse(job, { forDriver: true, driverId }),
      });
    }

    if (job.status !== 'started' && job.status !== 'in_progress' && !validateJobTransition(job.status, 'started')) {
      return res.status(400).json({
        success: false,
        message: `Job cannot be started from status ${job.status}`,
      });
    }

    const payload = req.body?.startAgreement || req.body || {};
    const termsRead = parseBoolean(payload.termsRead);
    const termsAccepted = parseBoolean(payload.termsAccepted);
    const rawStairs = payload.stairsOption !== undefined
      ? String(payload.stairsOption).trim().toLowerCase()
      : (payload.stairsAtProperty === true ? 'yes' : (payload.stairsAtProperty === false ? 'no' : ''));
    const stairsOption = (rawStairs === 'yes' || rawStairs === 'no') ? rawStairs : null;
    const customerSignature = normalizeOptionalString(payload.customerSignature || payload.startSignature || req.body?.startSignature || req.body?.customerSignature);
    const customerSignatureName = normalizeOptionalString(payload.customerSignatureName || payload.signerName || req.body?.customerSignatureName);
    const agreementVersion = normalizeOptionalString(payload.agreementVersion) || '1.0';

    if (!termsRead || !termsAccepted) {
      return res.status(400).json({
        success: false,
        code: 'TERMS_NOT_ACCEPTED',
        message: 'Terms and conditions must be read and accepted before starting the job.',
      });
    }

    if (!stairsOption) {
      return res.status(400).json({
        success: false,
        code: 'STAIRS_OPTION_REQUIRED',
        message: 'Please specify whether there are stairs at the property (yes or no).',
      });
    }

    if (!customerSignatureName || customerSignatureName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        code: 'SIGNATURE_NAME_REQUIRED',
        message: 'Customer signatory name is required.',
      });
    }

    if (!customerSignature || (typeof customerSignature === 'string' && customerSignature.trim().length < 20)) {
      return res.status(400).json({
        success: false,
        code: 'CUSTOMER_START_SIGNATURE_REQUIRED',
        message: 'Customer start signature is required.',
      });
    }

    const now = new Date();
    const stairsAtProperty = stairsOption === 'yes';

    const startAgreementData = {
      termsRead: true,
      termsAccepted: true,
      stairsAtProperty,
      stairsOption,
      customerSignature,
      customerSignatureName,
      agreementVersion,
      acceptedAt: now,
      startedAt: now,
      driverId,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };

    if (assignment) {
      assignment.startedAt = now;
      assignment.status = 'in_progress';
      assignment.startAgreement = startAgreementData;
      if (!assignment.pricingSnapshot) {
        assignment.pricingSnapshot = createDriverStartPricingSnapshot(job);
      }
    } else {
      assignment = {
        driverId,
        role: job.driverAssignments.length === 0 ? 'Lead Driver' : 'Driver',
        assignedAt: now,
        assignedBy: req.user?._id || null,
        status: 'in_progress',
        startedAt: now,
        completedAt: null,
        totalWorkedMinutes: 0,
        pricingSnapshot: createDriverStartPricingSnapshot(job),
        startAgreement: startAgreementData,
      };
      job.driverAssignments.push(assignment);
    }

    job.status = 'started';
    if (!job.startedAt) {
      job.startedAt = now;
      job.timerStarted = now;
    }
    if (!job.startSignature) {
      job.startSignature = customerSignature;
    }
    job.stairsAtProperty = stairsAtProperty;
    if (!job.startAgreement) {
      job.startAgreement = startAgreementData;
    }

    job.timeline.push({
      action: 'Start Agreement Accepted',
      performedBy: driverId,
      notes: `Driver session started. Customer ${customerSignatureName} accepted start agreement (Stairs: ${stairsOption.toUpperCase()})`,
      timestamp: now,
    });

    job.timeline.push({
      action: 'Job Started',
      performedBy: driverId,
      notes: `Driver ${req.user?.name || driverId} started work session`,
      timestamp: now,
    });

    await job.save();

    return res.status(200).json({
      success: true,
      message: 'Work session started successfully with Start Agreement',
      job: normalizeJobForResponse(job, { forDriver: true, driverId }),
    });
  } catch (error) {
    next(error);
  }
};

export const endDriverWorkSession = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    const driverId = getDriverId(req.user);
    const isAssigned = (job.assignedDrivers || []).some((driver) => {
      const assignedId = driver?._id || driver;
      return String(assignedId) === driverId;
    });

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this job',
      });
    }

    if (!Array.isArray(job.driverAssignments)) job.driverAssignments = [];
    let assignment = job.driverAssignments.find(
      (a) => String(a.driverId?._id || a.driverId) === driverId
    );

    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'Driver assignment record not found for this job',
      });
    }

    if (!assignment.startedAt) {
      return res.status(400).json({
        success: false,
        message: 'You have not started work on this job yet',
      });
    }

    if (assignment.status === 'completed') {
      return res.status(200).json({
        success: true,
        message: 'Work session was already completed',
        assignment,
        job: normalizeJobForResponse(job, { forDriver: true, driverId }),
      });
    }

    const now = new Date();
    assignment.completedAt = now;
    assignment.status = 'completed';
    const durationMs = now.getTime() - new Date(assignment.startedAt).getTime();
    assignment.totalWorkedMinutes = Math.max(0, Math.floor(durationMs / 60000));
    assignment.pricingSnapshot = finalizeDriverSessionPricing(assignment, job, now);

    job.timeline.push({
      action: 'Driver Session Ended',
      performedBy: req.user._id,
      notes: `Driver session ended (${assignment.totalWorkedMinutes} mins worked, Final Payout: $${assignment.pricingSnapshot.finalDriverAmount})`,
      timestamp: now,
    });

    await job.save();

    return res.status(200).json({
      success: true,
      message: 'Work session ended successfully',
      assignment,
      job: normalizeJobForResponse(job, { forDriver: true, driverId }),
    });
  } catch (error) {
    next(error);
  }
};

export const pauseJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');
    if (!validateJobTransition(job.status, 'paused')) return sendError(res, 400, 'Job must be started to pause.');

    job.status = 'paused';
    job.pauseIntervals.push({ pausedAt: new Date() });
    job.timeline.push({ action: 'Job Paused', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Job paused.');
  } catch (error) {
    next(error);
  }
};

export const resumeJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');
    if (!validateJobTransition(job.status, 'started')) return sendError(res, 400, 'Job must be paused to resume.');

    job.status = 'started';
    const lastPause = job.pauseIntervals[job.pauseIntervals.length - 1];
    if (lastPause && !lastPause.resumedAt) {
      lastPause.resumedAt = new Date();
    }
    job.timeline.push({ action: 'Job Resumed', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Job resumed.');
  } catch (error) {
    next(error);
  }
};

export const getJobCompletionTerms = async (_req, res, next) => {
  try {
    sendResponse(res, 200, { terms: JOB_COMPLETION_TERMS }, 'Job completion terms retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

export const getJobCompletionPreview = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');

    sendResponse(res, 200, {
      job: normalizeJobForResponse(job),
      preview: buildCompletionPreview(job),
      terms: JOB_COMPLETION_TERMS,
    }, 'Job completion preview retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

export const acceptJobTerms = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');

    const allowedStatuses = ['started', 'awaitingCompletion'];
    if (!allowedStatuses.includes(job.status)) {
      return sendError(res, 400, `Terms can only be accepted while the job is ${allowedStatuses.join(' or ')}.`);
    }

    job.termsAccepted = true;
    job.termsAcceptedAt = new Date();
    job.termsVersion = JOB_COMPLETION_TERMS.version;
    job.status = 'awaitingCompletion';
    job.timeline.push({
      action: 'TERMS_ACCEPTED',
      performedBy: req.user._id,
      notes: `Accepted terms v${JOB_COMPLETION_TERMS.version}`,
      timestamp: new Date(),
    });

    await job.save();
    await createActivityLog({
      userId: req.user._id,
      action: 'TERMS_ACCEPTED',
      entityId: job._id,
      details: `Driver accepted completion terms v${JOB_COMPLETION_TERMS.version}`,
      metadata: { termsVersion: JOB_COMPLETION_TERMS.version },
    });

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Job completion terms accepted.');
  } catch (error) {
    next(error);
  }
};

export const submitEndSignature = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');

    const endSignature = normalizeCompletionSignature(req);
    if (!endSignature) {
      return sendError(res, 400, 'End signature is required.');
    }

    if (!job.termsAccepted) {
      return sendError(res, 400, 'Terms must be accepted before submitting the end signature.');
    }

    job.endSignature = endSignature;
    job.customerEndSignature = endSignature;
    job.status = 'awaitingCompletion';
    job.timeline.push({
      action: 'END_SIGNATURE_SUBMITTED',
      performedBy: req.user._id,
      notes: 'Driver submitted end signature.',
      timestamp: new Date(),
    });

    await job.save();
    await createActivityLog({
      userId: req.user._id,
      action: 'END_SIGNATURE_SUBMITTED',
      entityId: job._id,
      details: 'Driver submitted customer end signature',
      metadata: { endSignature },
    });

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'End signature submitted successfully.');
  } catch (error) {
    next(error);
  }
};

export const completeJob = async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!mongoose.isValidObjectId(jobId)) {
      return sendError(res, 400, 'Invalid job ID');
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    const driverId = getDriverId(req.user);
    const isAssigned = (job.assignedDrivers || []).some((driver) => {
      const assignedId = driver?._id || driver;
      return String(assignedId) === driverId;
    });

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this job',
      });
    }

    if (job.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cancelled jobs cannot be completed',
      });
    }

    if (job.status === 'completed') {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'Job is already completed',
        job: normalizeJobForResponse(job),
      });
    }

    const currentTransitionAllowed = validateJobTransition(job.status, 'awaitingCompletion') || validateJobTransition(job.status, 'completed');
    if (!currentTransitionAllowed) {
      return sendError(res, 400, `Job cannot be completed from status ${job.status}.`);
    }

    const started = Date.now();
    console.log('COMPLETE_JOB_START', jobId);

    const rawTermsAccepted = req.body?.termsAccepted
      ?? req.body?.acceptedTerms
      ?? req.body?.isTermsAccepted
      ?? req.body?.termsAgreed;
    const termsAccepted = parseBoolean(rawTermsAccepted);
    const termsVersion = normalizeOptionalString(req.body?.termsVersion)
      || normalizeOptionalString(job.termsVersion)
      || JOB_COMPLETION_TERMS.version;
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod || job.paymentMethod || 'cash');
    const submittedEndSignature = normalizeCompletionSignature(req);
    const uploadedPaymentProof = normalizeCompletionProof(req);
    const transactionReference = resolveTransactionReference(req);
    const otherPaymentDetails = resolveOtherPaymentDetails(req);
    const completionNotes = resolveCompletionNotes(req);

    console.log('JOB_COMPLETION_DEBUG', {
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
      fileKeys: Object.keys(req.files || {}),
      hasCustomerEndSignature: Boolean(req.body?.customerEndSignature),
      hasCustomerSignature: Boolean(req.body?.customerSignature),
      hasSignatureData: Boolean(req.body?.signatureData),
    });

    console.log('Complete job request validation', {
      jobId,
      rawTermsAccepted,
      rawTermsAcceptedType: typeof rawTermsAccepted,
      parsedTermsAccepted: termsAccepted,
      termsVersion,
      paymentMethod,
      hasEndSignature: Boolean(submittedEndSignature),
      hasPaymentProof: Boolean(uploadedPaymentProof),
    });

    if (!termsAccepted) {
      return res.status(400).json({
        success: false,
        code: 'TERMS_NOT_ACCEPTED',
        message: 'Terms must be accepted before completing the job.',
      });
    }

    if (!submittedEndSignature || (typeof submittedEndSignature === 'string' && submittedEndSignature.trim().length < 20)) {
      return res.status(400).json({
        success: false,
        code: 'CUSTOMER_END_SIGNATURE_REQUIRED',
        message: 'Customer end signature is required.',
      });
    }

    const allowedPaymentMethods = ['cash', 'online', 'other'];
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return sendError(res, 400, 'Payment method must be cash, online, or other.');
    }

    if (paymentMethod === 'online' && !uploadedPaymentProof && !job.paymentProofUrl && !transactionReference) {
      return res.status(400).json({
        success: false,
        code: 'ONLINE_PAYMENT_VERIFICATION_REQUIRED',
        message: 'Online payments require a transaction reference or payment proof.',
      });
    }

    if (paymentMethod === 'other' && !otherPaymentDetails && !job.otherPaymentDetails) {
      return res.status(400).json({
        success: false,
        code: 'OTHER_PAYMENT_DETAILS_REQUIRED',
        message: 'Please provide payment details for Other payment.',
      });
    }

    const enteredAmountReceived = req.body.amountReceived ?? job.amountReceived;
    if (enteredAmountReceived !== undefined && enteredAmountReceived !== null && Number.isFinite(Number(enteredAmountReceived)) && Number(enteredAmountReceived) < 0) {
      return sendError(res, 400, 'Amount received must be zero or greater.');
    }

    const effectiveStartedAt = job.startedAt || job.timerStarted || (job.timeline || []).reverse().find((item) => item.action === 'Job Started')?.timestamp;
    if (!effectiveStartedAt) {
      return sendError(res, 400, 'Job start time is missing. Job must be started before it can be completed.');
    }

    const completedAt = job.completedAt || new Date();
    const durationMs = completedAt.getTime() - new Date(effectiveStartedAt).getTime();
    if (durationMs < 0) {
      return sendError(res, 400, 'Job completion time cannot be earlier than job start time.');
    }

    const totalWorkedMinutes = Math.max(
      0,
      Math.floor(durationMs / 60000)
    );
    const billableHours = Number((totalWorkedMinutes / 60).toFixed(2));
    const currentTermsVersion = String(job.termsVersion || JOB_COMPLETION_TERMS.version || '1.0').trim();

    const customerSignature = normalizeOptionalString(req.body?.customerSignature)
      ?? normalizeOptionalString(req.body?.customerEndSignature)
      ?? submittedEndSignature;
    const driverCompletionSignature = normalizeOptionalString(req.body?.driverCompletionSignature)
      ?? normalizeOptionalString(req.body?.driverSignature);
    const customerSignatureDate = req.body?.customerSignatureDate
      ? new Date(req.body.customerSignatureDate)
      : completedAt;
    const paymentProofPath = uploadedPaymentProof || normalizeSecureUrl(job.paymentProofUrl);
    const parsedAmountReceived = enteredAmountReceived === undefined || enteredAmountReceived === null || enteredAmountReceived === ''
      ? null
      : Number(enteredAmountReceived);
    if (enteredAmountReceived !== undefined && enteredAmountReceived !== null && enteredAmountReceived !== '' && !Number.isFinite(parsedAmountReceived)) {
      return sendError(res, 400, 'Amount received must be a valid number.');
    }

    const rawHasDamage = req.body?.hasDamage ?? req.body?.isDamaged ?? req.body?.damage;
    const hasDamage = parseBoolean(rawHasDamage);
    const damageReport = normalizeOptionalString(req.body?.damageReport)
      || normalizeOptionalString(req.body?.damageNotes)
      || (hasDamage ? 'Damage reported by driver' : 'None');
    const damagePhotos = normalizeDamagePhotos(req);
    const completionPhotos = normalizeCompletionPhotos(req);

    job.termsAccepted = true;
    const termsReadAt = req.body?.termsReadAt ? new Date(req.body.termsReadAt) : job.termsReadAt || completedAt;
    job.termsReadAt = Number.isNaN(termsReadAt.getTime()) ? completedAt : termsReadAt;
    const termsAcceptedAt = req.body?.termsAcceptedAt ? new Date(req.body.termsAcceptedAt) : completedAt;
    job.termsAcceptedAt = Number.isNaN(termsAcceptedAt.getTime()) ? completedAt : termsAcceptedAt;
    job.termsVersion = termsVersion || currentTermsVersion;
    job.deliveryConfirmed = parseBoolean(req.body?.deliveryConfirmed);
    job.stairsAtProperty = parseBoolean(req.body?.stairsAtProperty);
    job.stairsWaiverAccepted = parseBoolean(req.body?.stairsWaiverAccepted);
    job.customerSignature = customerSignature;
    job.customerEndSignature = customerSignature;
    job.customerSignatureName = normalizeOptionalString(req.body?.customerSignatureName) || job.customerSignatureName || null;
    job.customerSignatureDate = Number.isNaN(customerSignatureDate.getTime()) ? completedAt : customerSignatureDate;
    job.driverName = normalizeOptionalString(req.body?.driverName) || normalizeOptionalString(req.user?.name) || job.driverName || null;
    job.driverCompletionSignature = driverCompletionSignature;
    job.signature = driverCompletionSignature || job.signature || null;
    job.endSignature = customerSignature;
    job.completedByDriverId = driverId;
    job.paymentMethod = paymentMethod;
    job.paymentProof = paymentProofPath;
    job.paymentProofUrl = paymentProofPath;
    job.paymentTransactionReference = transactionReference || job.paymentTransactionReference || null;
    job.transactionReference = normalizeOptionalString(req.body?.transactionReference) || job.transactionReference || transactionReference || null;
    job.otherPaymentDetails = otherPaymentDetails || job.otherPaymentDetails || null;
    job.amountReceived = Number.isFinite(parsedAmountReceived) ? parsedAmountReceived : null;
    job.paymentNotes = normalizeOptionalString(req.body?.paymentNotes) || job.paymentNotes || null;
    job.completionNotes = normalizeOptionalString(completionNotes) || job.completionNotes || 'Job completed by driver';
    job.hasDamage = hasDamage;
    job.damageReport = damageReport;

    if (!Array.isArray(job.damagePhotos)) job.damagePhotos = [];
    if (damagePhotos.length > 0) {
      job.damagePhotos = Array.from(new Set([...job.damagePhotos, ...damagePhotos]));
    }

    if (!Array.isArray(job.photos)) job.photos = [];
    if (completionPhotos.length > 0) {
      job.photos = Array.from(new Set([...job.photos, ...completionPhotos]));
    }
    if (uploadedPaymentProof && !job.photos.includes(uploadedPaymentProof)) {
      job.photos.push(uploadedPaymentProof);
    }

    if (!job.startedAt) job.startedAt = new Date(effectiveStartedAt);
    if (!job.timerStarted) job.timerStarted = job.startedAt;
    job.status = 'completed';
    job.endedAt = completedAt;
    job.completedAt = completedAt;
    job.timerEnded = completedAt;
    job.totalWorkedMinutes = totalWorkedMinutes;
    job.billableHours = billableHours;

    // Finalize per-driver assignments
    if (!Array.isArray(job.driverAssignments)) job.driverAssignments = [];
    const callingAssignment = job.driverAssignments.find(
      (a) => String(a.driverId?._id || a.driverId) === driverId
    );
    if (callingAssignment) {
      callingAssignment.status = 'completed';
      callingAssignment.completedAt = callingAssignment.completedAt || completedAt;
      if (callingAssignment.startedAt && (!callingAssignment.totalWorkedMinutes || callingAssignment.totalWorkedMinutes <= 0)) {
        const dMs = completedAt.getTime() - new Date(callingAssignment.startedAt).getTime();
        callingAssignment.totalWorkedMinutes = Math.max(0, Math.floor(dMs / 60000));
      }
      callingAssignment.pricingSnapshot = finalizeDriverSessionPricing(callingAssignment, job, callingAssignment.completedAt || completedAt);
    }
    // Also auto-complete any other in-progress assignments on job completion
    job.driverAssignments.forEach((assignment) => {
      if (assignment.status === 'in_progress') {
        assignment.status = 'completed';
        assignment.completedAt = completedAt;
        if (assignment.startedAt && (!assignment.totalWorkedMinutes || assignment.totalWorkedMinutes <= 0)) {
          const dMs = completedAt.getTime() - new Date(assignment.startedAt).getTime();
          assignment.totalWorkedMinutes = Math.max(0, Math.floor(dMs / 60000));
        }
        assignment.pricingSnapshot = finalizeDriverSessionPricing(assignment, job, completedAt);
      } else if (assignment.status === 'completed' && !assignment.pricingSnapshot) {
        assignment.pricingSnapshot = finalizeDriverSessionPricing(assignment, job, assignment.completedAt || completedAt);
      }
    });

    const billing = calculateBilling({ ...job, totalWorkedMinutes });
    job.billing = { ...job.billing, ...billing };

    job.completion = {
      termsRead: parseBoolean(req.body?.termsRead ?? true),
      termsAccepted: true,
      customerSignature: customerSignature,
      customerSignatureName: normalizeOptionalString(req.body?.customerSignatureName) || job.customerSignatureName || null,
      driverCompletionSignature: driverCompletionSignature || null,
      hasDamage: hasDamage,
      damageReport: damageReport,
      damagePhotos: job.damagePhotos || [],
      photos: job.photos || [],
      paymentMethod: paymentMethod,
      amountReceived: Number.isFinite(parsedAmountReceived) ? parsedAmountReceived : null,
      paymentProofUrl: paymentProofPath || null,
      transactionReference: transactionReference || null,
      otherPaymentDetails: otherPaymentDetails || null,
      notes: normalizeOptionalString(completionNotes) || null,
      completedAt: completedAt,
      driverId: driverId,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const alreadyCompletedTimeline = (job.timeline || []).some((item) => item.action === 'Job Completed');
    if (!alreadyCompletedTimeline) {
      job.timeline.push({
        action: 'Job Completed',
        performedBy: driverId,
        notes: hasDamage
          ? `Worked ${billableHours}h (${totalWorkedMinutes} mins). ⚠️ Damage Reported: ${damageReport}`
          : `Worked ${billableHours}h (${totalWorkedMinutes} mins). ✅ No damage reported.`,
        timestamp: completedAt,
      });
    }

    const completionSession = await mongoose.startSession();
    try {
      try {
        await completionSession.withTransaction(async () => {
          await job.save({ session: completionSession });
        });
      } catch (error) {
        const standaloneMongoError = error?.code === 20
          || error?.code === 251
          || /transaction numbers are only allowed/i.test(error?.message || '');
        if (!standaloneMongoError) throw error;

        console.warn('MongoDB transactions unavailable; saving completion atomically without session', {
          jobId,
          message: error.message,
        });
        await job.save();
      }
    } finally {
      await completionSession.endSession();
    }

    const responseJob = normalizeJobForResponse(job);
    res.status(200).json({
      success: true,
      message: 'Job completed successfully',
      data: {
        job: responseJob,
        jobId: String(job._id),
        status: String(responseJob.status || '').toUpperCase(),
        completedAt: responseJob.completedAt,
        driverCompletionSignature: responseJob.driverCompletionSignature,
        paymentProofUrl: responseJob.paymentProofUrl,
      },
    });
    console.log('COMPLETE_JOB_DONE', jobId, `${Date.now() - started}ms`);

    setImmediate(async () => {
      try {
        await createActivityLog({
          userId: req.user._id,
          action: 'JOB_COMPLETED',
          entityId: job._id,
          details: 'Driver submitted final completion, payment select, and proof',
          metadata: {
            paymentMethod,
            amountReceived: job.amountReceived,
            paymentProofUrl: job.paymentProofUrl,
            paymentTransactionReference: job.paymentTransactionReference,
            termsAccepted: true,
            termsVersion: job.termsVersion,
          },
        });
      } catch (error) {
        console.error('Completion activity log failed', { jobId: job._id, message: error.message, code: error.code });
      }

      try {
        await Driver.updateMany(
          { userId: { $in: job.assignedDrivers } },
          { $inc: { completedJobs: 1 }, availability: 'available' }
        );
      } catch (error) {
        console.error('Driver availability update failed', { jobId: job._id, message: error.message, code: error.code });
      }

      await Promise.allSettled([
        createAndSendDriverNotification({
          driverId,
          type: 'JOB_COMPLETED',
          title: 'Job Completed',
          message: 'Job completed successfully.',
          jobId: job._id,
          data: {
            type: 'JOB_COMPLETED',
            jobId: String(job._id),
            screen: 'JobDetail',
          },
          deduplicationKey: `JOB_COMPLETED:${job._id}`,
        }).catch((error) => console.error('Job completion notification dispatch failed', { message: error.message, code: error.code })),
        createAndSendDriverNotification({
          driverId,
          type: 'PAYMENT_UPDATED',
          title: 'Payment Updated',
          message: 'Payment information for your assigned job has been updated.',
          jobId: job._id,
          data: {
            type: 'PAYMENT_UPDATED',
            jobId: String(job._id),
            screen: 'JobDetail',
          },
          deduplicationKey: `PAYMENT_UPDATED:${job._id}:${driverId}`,
        }).catch((error) => console.error('Payment update notification dispatch failed', { message: error.message, code: error.code })),
      ]);

      try {
        const manifest = buildCompletionDocumentsPayload(job);
        job.completionDocuments = manifest;
        job.completionDocumentsStatus = 'pending';
        await job.save();

        const emailResult = await sendCompletionDocumentsEmail({
          job: normalizeJobForResponse(job),
          to: process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        });

        job.completionDocuments = {
          ...job.completionDocuments,
          status: 'sent',
          sentAt: new Date(),
          recipientCount: emailResult.recipients.length,
          recipients: emailResult.recipients,
          messageId: emailResult.messageId,
        };
        job.completionDocumentsStatus = 'sent';
        job.completionDocumentsSentAt = new Date();
        await job.save();
      } catch (error) {
        console.error('Completion document dispatch failed', {
          jobId: job._id,
          message: error.message,
          code: error.code,
        });
        try {
          job.completionDocuments = {
            ...job.completionDocuments,
            status: 'failed',
            sentAt: null,
          };
          job.completionDocumentsStatus = 'failed';
          await job.save();
        } catch (e) {
          console.error('Failed to persist completion document failure state', { jobId: job._id, message: e.message });
        }
      }
    });
    return;
  } catch (error) {
    next(error);
  }
};

export const resendCompletionDocuments = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');

    const manifest = buildCompletionDocumentsPayload(job);
    const sendTo = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

    const result = await sendCompletionDocumentsEmail({
      job: normalizeJobForResponse(job),
      to: sendTo,
    });

    job.completionDocuments = {
      ...manifest,
      status: 'sent',
      sentAt: new Date(),
      recipientCount: result.recipients.length,
      recipients: result.recipients,
      messageId: result.messageId,
    };
    job.completionDocumentsStatus = 'resend';
    job.completionDocumentsSentAt = new Date();
    await job.save();

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'Completion documents resent successfully.');
  } catch (error) {
    next(error);
  }
};

export const uploadJobPhotos = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!ensureDriverOwnership(job, req.user._id)) return sendError(res, 403, 'You are not assigned to this job.');

    if (req.files && req.files.length > 0) {
      const photoPaths = req.files.map(f => `/uploads/${f.filename}`);
      job.photos.push(...photoPaths);

      const isPaymentProofUpload = [
        'paymentProof',
        'payment_proof',
        'proof',
      ].includes(String(req.body?.photoType || req.query?.type || '').trim());

      if (isPaymentProofUpload && photoPaths.length > 0) {
        job.paymentProofUrl = job.paymentProofUrl || photoPaths[0];
        job.paymentProof = job.paymentProof || photoPaths[0];
      }

      await job.save();
      const publicUrl = normalizeUrlFromPath(req, photoPaths[0]);
      return sendResponse(res, 200, {
        job: normalizeJobForResponse(job),
        url: publicUrl,
        file: { url: publicUrl },
      }, 'Photos uploaded.');
    }

    sendResponse(res, 200, { job: normalizeJobForResponse(job) }, 'No photos uploaded.');
  } catch (error) {
    next(error);
  }
};

// Driver's own jobs (confirmed bookings only)
export const getDriverJobs = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {
      assignedDrivers: req.user._id,
      bookingStatus: { $ne: 'quotation' },
    };
    if (status) filter.status = status;

    const jobs = await Job.find(filter)
      .populate('assignedVehicle', 'name type registration')
      .sort({ scheduledDate: 1 });

    sendResponse(res, 200, { jobs: jobs.map((job) => normalizeJobForResponse(job, { forDriver: true })) });
  } catch (error) {
    next(error);
  }
};

export const getDriverTodayJobs = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const jobs = await Job.find({
      assignedDrivers: req.user._id,
      bookingStatus: { $ne: 'quotation' },
      scheduledDate: { $gte: today, $lt: tomorrow },
    })
      .populate('assignedVehicle', 'name type registration')
      .sort({ scheduledDate: 1 });

    sendResponse(res, 200, { jobs: jobs.map((job) => normalizeJobForResponse(job, { forDriver: true })) });
  } catch (error) {
    next(error);
  }
};

// Quotation & Confirmation Workflow
export const confirmBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, 'Invalid job ID.');
    }

    const job = await Job.findById(id);
    if (!job) {
      return sendError(res, 404, 'Job not found.');
    }

    if (job.bookingStatus === 'confirmed') {
      return sendError(res, 400, 'Booking is already confirmed.');
    }

    const payload = req.body || {};
    const bookingConfirmationAttachmentIds = normalizeEmailAttachmentIds(payload.bookingConfirmationEmailAttachments);
    const selectedAttachmentIds = mergeEmailAttachmentIds(
      normalizeEmailAttachmentIds(payload.selectedEmailAttachments),
      bookingConfirmationAttachmentIds,
    );

    // Allow updating fields during confirmation if provided
    if (payload.customerName) job.customerName = payload.customerName.trim();
    if (payload.customerPhone) job.customerPhone = payload.customerPhone.trim();
    if (payload.customerEmail !== undefined) job.customerEmail = normalizeOptionalString(payload.customerEmail);
    if (payload.pickupAddress) job.pickupAddress = resolvePickupAddress(payload) || job.pickupAddress;
    if (payload.pickupSuburb !== undefined) job.pickupSuburb = payload.pickupSuburb;
    if (payload.pickupState !== undefined) job.pickupState = payload.pickupState;
    if (payload.pickupPostcode !== undefined) job.pickupPostcode = payload.pickupPostcode;
    if (payload.pickupNotes !== undefined) job.pickupNotes = payload.pickupNotes;
    if (payload.dropAddress) job.dropAddress = resolveDropoffAddress(payload) || job.dropAddress;
    if (payload.dropSuburb !== undefined) job.dropSuburb = payload.dropSuburb;
    if (payload.dropState !== undefined) job.dropState = payload.dropState;
    if (payload.dropPostcode !== undefined) job.dropPostcode = payload.dropPostcode;
    if (payload.dropNotes !== undefined) job.dropNotes = payload.dropNotes;
    if (payload.jobType) job.jobType = normalizeJobType(payload.jobType);
    if (payload.scheduledDate) job.scheduledDate = new Date(payload.scheduledDate);
    if (payload.scheduledTime !== undefined) job.scheduledTime = payload.scheduledTime;
    if (payload.scheduledStartTime !== undefined) job.scheduledStartTime = payload.scheduledStartTime;
    if (payload.scheduledEndTime !== undefined) job.scheduledEndTime = payload.scheduledEndTime;
    if (payload.scheduleMode) job.scheduleMode = payload.scheduleMode;
    if (payload.pricingType) job.pricingType = payload.pricingType;
    if (payload.hourlyRate !== undefined) job.hourlyRate = Number(payload.hourlyRate);
    if (payload.estimatedHours !== undefined) job.estimatedHours = Number(payload.estimatedHours);
    if (payload.fixedPrice !== undefined) job.fixedPrice = Number(payload.fixedPrice);
    if (payload.fixedQuote !== undefined) job.fixedQuote = Number(payload.fixedQuote);
    if (payload.propertySize !== undefined) job.propertySize = payload.propertySize;
    if (payload.truckSize !== undefined) job.truckSize = normalizeTruckSize(payload.truckSize);
    if (payload.movers !== undefined) job.movers = Number(payload.movers);
    if (payload.callOutFee !== undefined) job.callOutFee = Number(payload.callOutFee);
    if (payload.callOutTimeMin !== undefined) job.callOutTimeMin = Number(payload.callOutTimeMin);
    if (payload.callOutTimeHr !== undefined) job.callOutTimeHr = Number(payload.callOutTimeHr);
    if (payload.travelBackFee !== undefined) job.travelBackFee = Number(payload.travelBackFee);
    if (payload.travelBackTimeMin !== undefined) job.travelBackTimeMin = Number(payload.travelBackTimeMin);
    if (payload.travelBackTimeHr !== undefined) job.travelBackTimeHr = Number(payload.travelBackTimeHr);
    if (payload.lineItems !== undefined || payload.itemList !== undefined) {
      job.lineItems = normalizeLineItemsValue(payload.lineItems ?? payload.itemList ?? '');
    }
    if (payload.notes !== undefined) job.notes = payload.notes;
    if (payload.bookingDepositAmount !== undefined && payload.bookingDepositAmount !== null && payload.bookingDepositAmount !== '') {
      job.bookingDepositAmount = Number(payload.bookingDepositAmount);
    }
    if (payload.bookingConfirmationEmailAttachments !== undefined || payload.selectedEmailAttachments !== undefined) {
      job.bookingConfirmationEmailAttachments = bookingConfirmationAttachmentIds;
      job.selectedEmailAttachments = selectedAttachmentIds;
    }
    if (payload.emailAttachmentOptions !== undefined) {
      job.emailAttachmentOptions = {
        ...job.emailAttachmentOptions,
        quotation: payload.emailAttachmentOptions?.quotation !== false,
        bookingConfirmation: payload.emailAttachmentOptions?.bookingConfirmation !== false,
      };
    }

    // Driver & vehicle assignment if provided
    if (Array.isArray(payload.driverIds)) {
      job.assignedDrivers = payload.driverIds.map((d) => String(d?._id || d)).filter(Boolean);
    }
    if (payload.vehicleId !== undefined) {
      job.assignedVehicle = payload.vehicleId || null;
    }

    // Status transition
    job.bookingStatus = 'confirmed';
    job.status = 'pending';
    job.quotation = job.quotation || {};
    job.quotation.status = 'accepted';
    job.quotation.acceptedAt = new Date();

    job.confirmation = {
      confirmedAt: new Date(),
      confirmedBy: req.user?._id || null,
      emailSent: false,
      emailSentAt: null,
      messageId: null,
      error: null,
    };

    job.timeline.push({
      action: 'Quotation Converted to Booking',
      timestamp: new Date(),
      performedBy: req.user?._id,
      notes: 'Quotation was successfully confirmed and moved to active Confirmed Jobs.',
    });

    await job.save();

    await createActivityLog({
      userId: req.user?._id,
      action: 'QUOTATION_CONVERTED_TO_BOOKING',
      entityId: job._id,
      details: `Quotation ${job.jobNumber} converted to confirmed booking.`,
      metadata: {
        jobNumber: job.jobNumber,
        customerName: job.customerName,
        customerEmail: job.customerEmail,
        confirmedAt: job.confirmation.confirmedAt,
      },
    });

    // Create Notification
    try {
      await Notification.create({
        userId: req.user?._id,
        type: 'job_confirmed',
        title: 'Booking Confirmed',
        message: `${job.jobNumber} has been successfully converted from quotation to confirmed booking.`,
        data: { jobId: job._id, jobNumber: job.jobNumber },
      });
    } catch (notifErr) {
      console.warn('Failed to create admin notification on booking confirmation', notifErr.message);
    }

    // Send confirmation email if requested or available
    const shouldSendEmail = payload.sendBookingConfirmationEmail !== false && Boolean(job.customerEmail);
    let emailResult = { sent: false, error: null, pending: false };

    if (shouldSendEmail) {
      emailResult.pending = true;
      setImmediate(async () => {
        try {
          const depositAmount = job.bookingDepositAmount || 0;
          const freshJob = await Job.findById(job._id).lean();
          const requestedAttachmentIds = mergeEmailAttachmentIds(
            normalizeEmailAttachmentIds(payload.bookingConfirmationEmailAttachments),
            normalizeEmailAttachmentIds(payload.selectedEmailAttachments),
            normalizeEmailAttachmentIds(freshJob?.bookingConfirmationEmailAttachments),
            normalizeEmailAttachmentIds(freshJob?.selectedEmailAttachments),
          );
          const attachments = payload.emailAttachmentOptions?.bookingConfirmation !== false || job.emailAttachmentOptions?.bookingConfirmation !== false
            ? await buildEmailAttachments(requestedAttachmentIds)
            : [];
          const sendResult = await sendBookingConfirmationEmail({
            job: freshJob,
            to: job.customerEmail,
            bookingDepositAmount: depositAmount,
            attachments,
          });

          await Job.findByIdAndUpdate(job._id, {
            $set: {
              'confirmation.emailSent': true,
              'confirmation.emailSentAt': new Date(),
              'confirmation.messageId': sendResult.messageId,
              'confirmationSent': true,
              'confirmationSentAt': new Date(),
              'confirmation.error': null,
            },
          });
        } catch (emailErr) {
          console.error('Booking confirmation email failed during conversion', emailErr.message);
          await Job.findByIdAndUpdate(job._id, {
            $set: {
              'confirmation.emailSent': false,
              'confirmation.error': emailErr.message || 'Unable to send booking confirmation email',
            },
          });
        }
      });
    }

    const populatedJob = await Job.findById(job._id)
      .populate('assignedDrivers', 'name email phone')
      .populate('assignedVehicle', 'name type registration')
      .populate('customerId', 'name email phone address');

    return sendResponse(res, 200, {
      job: normalizeJobForResponse(populatedJob),
      emailStatus: {
        confirmationSent: emailResult.sent,
        error: emailResult.error,
        pending: emailResult.pending,
      },
    }, 'Quotation successfully converted to confirmed booking.');
  } catch (error) {
    next(error);
  }
};

export const sendQuotationEmailEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!job.customerEmail) return sendError(res, 400, 'Customer email is required.');

    const attachments = await buildEmailAttachments(job.quotationEmailAttachments || []);
    const result = await sendQuotationEmail({ job: job.toObject(), to: job.customerEmail, attachments });

    job.quotation = job.quotation || {};
    job.quotation.status = 'sent';
    job.quotation.sentAt = new Date();
    job.quotationSent = true;
    job.quotationSentAt = new Date();
    job.timeline.push({
      action: 'Quotation Email Sent',
      timestamp: new Date(),
      performedBy: req.user?._id,
      notes: `Quotation sent to ${job.customerEmail}`,
    });
    await job.save();

    return sendResponse(res, 200, {
      job: normalizeJobForResponse(job),
      sent: true,
      messageId: result?.messageId,
    }, 'Quotation email sent successfully.');
  } catch (error) {
    next(error);
  }
};

export const resendConfirmationEmailEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.bookingStatus !== 'confirmed') return sendError(res, 400, 'Job is not a confirmed booking.');
    if (!job.customerEmail) return sendError(res, 400, 'Customer email is required.');

    const depositAmount = job.bookingDepositAmount || 0;
    const attachments = await buildEmailAttachments(job.bookingConfirmationEmailAttachments || []);
    const result = await sendBookingConfirmationEmail({
      job: job.toObject(),
      to: job.customerEmail,
      bookingDepositAmount: depositAmount,
      attachments,
    });

    job.confirmation = job.confirmation || {};
    job.confirmation.emailSent = true;
    job.confirmation.emailSentAt = new Date();
    job.confirmation.messageId = result?.messageId || null;
    job.confirmation.error = null;
    job.confirmationSent = true;
    job.confirmationSentAt = new Date();
    job.timeline.push({
      action: 'Booking Confirmation Email Resent',
      timestamp: new Date(),
      performedBy: req.user?._id,
      notes: `Confirmation resent to ${job.customerEmail}`,
    });
    await job.save();

    return sendResponse(res, 200, {
      job: normalizeJobForResponse(job),
      sent: true,
      messageId: result?.messageId,
    }, 'Booking confirmation email sent successfully.');
  } catch (error) {
    next(error);
  }
};

export const getQuotationStats = async (_req, res, next) => {
  try {
    const result = await Job.aggregate([
      { $match: { bookingStatus: 'quotation' } },
      {
        $group: {
          _id: '$quotation.status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusMap = {};
    let total = 0;
    for (const item of result) {
      statusMap[item._id || 'draft'] = item.count;
      total += item.count;
    }

    const draft = statusMap.draft || 0;
    const pending = statusMap.pending || 0;
    const sent = statusMap.sent || 0;
    const viewed = statusMap.viewed || 0;
    const accepted = statusMap.accepted || 0;
    const rejected = statusMap.rejected || 0;
    const expired = statusMap.expired || 0;
    const active = total - rejected - expired;

    return sendResponse(res, 200, {
      total,
      draft,
      pending,
      sent,
      viewed,
      accepted,
      rejected,
      expired,
      active,
    });
  } catch (error) {
    next(error);
  }
};

export const previewJobEmailTemplate = async (req, res, next) => {
  try {
    const { templateKey = 'quotation', jobData = {}, attachmentIds = [] } = req.body;
    const normalizedKey = templateKey === 'booking_confirmation' ? 'booking_confirmation' : 'quotation';

    // Provide sensible fallbacks for preview
    const safeJobData = { ...jobData };
    if (normalizedKey === 'booking_confirmation') {
      if (!safeJobData.bookingDepositAmount && !safeJobData.depositAmount) {
        safeJobData.bookingDepositAmount = 50;
      }
    }
    if (!safeJobData.jobNumber && !safeJobData.quoteRef) {
      safeJobData.jobNumber = 'PREVIEW-' + (new Date().toISOString().slice(2, 10).replace(/-/g, ''));
    }

    const attachments = await buildEmailAttachments(attachmentIds);
    let template;
    try {
      template = await renderEmailTemplate(normalizedKey, safeJobData, { attachments });
    } catch (err) {
      if (normalizedKey === 'quotation') {
        template = buildQuotationEmail(safeJobData, { attachments });
      } else {
        template = buildBookingConfirmationEmail(safeJobData, { attachments });
      }
    }

    return sendResponse(res, 200, {
      templateKey: normalizedKey,
      subject: template.subject,
      html: template.html,
      text: template.text,
    }, 'Email template preview generated successfully.');
  } catch (error) {
    next(error);
  }
};


export const createPublicBooking = async (req, res, next) => {
  try {
    const {
      name,
      customerName,
      phone,
      customerPhone,
      email,
      customerEmail,
      pickupAddress,
      dropAddress,
      dropoffAddress,
      scheduledDate,
      jobType = 'delivery',
      notes = '',
    } = req.body;

    const finalCustomerName = String(customerName || name || '').trim();
    const finalCustomerPhone = String(customerPhone || phone || '').trim();
    const finalCustomerEmail = String(customerEmail || email || '').trim().toLowerCase();
    const finalPickupAddress = String(pickupAddress || '').trim();
    const finalDropAddress = String(dropAddress || dropoffAddress || '').trim();

    if (!finalCustomerName || !finalCustomerPhone || !finalPickupAddress || !finalDropAddress || !scheduledDate) {
      return sendError(res, 400, 'Customer name, phone, pickup address, drop-off address, and scheduled date are required.');
    }

    const normalizedJobType = normalizeJobType(jobType);
    const validJobType = ['moving', 'delivery'].includes(normalizedJobType) ? normalizedJobType : 'delivery';

    const jobData = {
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      customerEmail: finalCustomerEmail || undefined,
      pickupAddress: finalPickupAddress,
      dropAddress: finalDropAddress,
      dropoffAddress: finalDropAddress,
      scheduledDate: new Date(scheduledDate),
      jobType: validJobType,
      bookingStatus: 'quotation',
      quotation: {
        status: 'pending',
        sentAt: null,
      },
      notes: String(notes || '').trim(),
      timeline: [{
        action: 'Public Booking Request Submitted',
        notes: 'Submitted via Customer Booking Portal',
        timestamp: new Date(),
      }],
    };

    const job = await Job.create(jobData);

    return sendResponse(res, 201, {
      job: normalizeJobForResponse(job),
      bookingId: job.jobNumber || job._id,
    }, 'Booking request submitted successfully! Our team will review and get in touch.');
  } catch (error) {
    next(error);
  }
};

export const adjustCompletedJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('assignedDrivers', 'name email phone')
      .populate('driverAssignments.driverId', 'name email phone')
      .populate('assignedVehicle', 'name type registration')
      .populate('customerId', 'name email phone address')
      .populate('completedByDriverId', 'name email phone')
      .populate('createdBy', 'name email role');

    if (!job) return sendError(res, 404, 'Job not found.');

    const {
      reason,
      startedAt,
      completedAt,
      totalWorkedMinutes,
      driverTimings,
      hourlyRate,
      fixedPrice,
      minimumChargeHours,
      manualDriverPayout,
      manualCustomerTotal,
      extraCharges,
      extraChargeNotes,
      discount,
      paymentMethod,
      amountReceived,
      transactionReference,
      paymentNotes,
      completionNotes,
    } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return sendError(res, 400, 'Adjustment Reason is mandatory (minimum 3 characters).');
    }

    const changes = [];
    const recordChange = (field, label, oldValue, newValue) => {
      if (oldValue !== newValue && !(oldValue === null && newValue === undefined) && !(oldValue === undefined && newValue === null)) {
        changes.push({
          field,
          label,
          oldValue: oldValue !== undefined ? oldValue : null,
          newValue: newValue !== undefined ? newValue : null,
        });
      }
    };

    let globalStartedAt = job.startedAt;
    let globalCompletedAt = job.completedAt;

    if (startedAt !== undefined && startedAt !== null) {
      const newStart = new Date(startedAt);
      if (!isNaN(newStart.getTime())) {
        recordChange('startedAt', 'Job Start Time', job.startedAt ? job.startedAt.toISOString() : null, newStart.toISOString());
        job.startedAt = newStart;
        globalStartedAt = newStart;
      }
    }

    if (completedAt !== undefined && completedAt !== null) {
      const newEnd = new Date(completedAt);
      if (!isNaN(newEnd.getTime())) {
        recordChange('completedAt', 'Job End Time', job.completedAt ? job.completedAt.toISOString() : null, newEnd.toISOString());
        job.completedAt = newEnd;
        globalCompletedAt = newEnd;
      }
    }

    if (Array.isArray(driverTimings) && driverTimings.length > 0) {
      driverTimings.forEach((dt) => {
        const dId = String(dt.driverId?._id || dt.driverId);
        const assignment = job.driverAssignments.find((a) => String(a.driverId?._id || a.driverId) === dId);
        if (assignment) {
          if (dt.startedAt) {
            const dStart = new Date(dt.startedAt);
            if (!isNaN(dStart.getTime())) {
              recordChange(`driverAssignments.${dId}.startedAt`, `Driver Start Time`, assignment.startedAt?.toISOString() || null, dStart.toISOString());
              assignment.startedAt = dStart;
            }
          }
          if (dt.completedAt) {
            const dEnd = new Date(dt.completedAt);
            if (!isNaN(dEnd.getTime())) {
              recordChange(`driverAssignments.${dId}.completedAt`, `Driver End Time`, assignment.completedAt?.toISOString() || null, dEnd.toISOString());
              assignment.completedAt = dEnd;
            }
          }
          if (assignment.startedAt && assignment.completedAt) {
            const diffMs = assignment.completedAt.getTime() - assignment.startedAt.getTime();
            const calcMins = Math.max(0, Math.round(diffMs / 60000));
            recordChange(`driverAssignments.${dId}.totalWorkedMinutes`, `Driver Worked Minutes`, assignment.totalWorkedMinutes, calcMins);
            assignment.totalWorkedMinutes = calcMins;
          }
        }
      });
    } else if (globalStartedAt && globalCompletedAt) {
      const diffMs = globalCompletedAt.getTime() - globalStartedAt.getTime();
      const calcMins = Math.max(0, Math.round(diffMs / 60000));
      job.totalWorkedMinutes = calcMins;
      job.driverAssignments.forEach((a) => {
        if (!a.startedAt || startedAt) a.startedAt = globalStartedAt;
        if (!a.completedAt || completedAt) a.completedAt = globalCompletedAt;
        a.totalWorkedMinutes = calcMins;
      });
    }

    if (hourlyRate !== undefined && hourlyRate !== null) {
      const newRate = Number(hourlyRate);
      recordChange('hourlyRate', 'Hourly Rate', job.hourlyRate, newRate);
      job.hourlyRate = newRate;
    }

    if (fixedPrice !== undefined && fixedPrice !== null) {
      const newFixed = Number(fixedPrice);
      recordChange('fixedPrice', 'Fixed Price', job.fixedPrice, newFixed);
      job.fixedPrice = newFixed;
    }

    if (minimumChargeHours !== undefined && minimumChargeHours !== null) {
      const newMinH = Number(minimumChargeHours);
      recordChange('minimumChargeHours', 'Base / Min Hours', job.minimumChargeHours, newMinH);
      job.minimumChargeHours = newMinH;
    }

    let totalDriverFinalAmount = 0;
    let totalDriverWorkedMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalOvertimeAmount = 0;

    const effectiveBaseHours = Number(job.minimumChargeHours || job.estimatedHours || 2);
    const effectiveHourlyRate = Number(job.hourlyRate || 0);

    if (totalWorkedMinutes !== undefined && totalWorkedMinutes !== null && totalWorkedMinutes !== '') {
      const explicitMins = Math.max(0, Number(totalWorkedMinutes));
      recordChange('totalWorkedMinutes', 'Total Worked Minutes', job.totalWorkedMinutes, explicitMins);
      job.totalWorkedMinutes = explicitMins;
    }

    job.driverAssignments.forEach((assignment) => {
      const dId = String(assignment.driverId?._id || assignment.driverId);
      const dtMatch = Array.isArray(driverTimings) ? driverTimings.find((t) => String(t.driverId?._id || t.driverId) === dId) : null;
      const workedMins = Number(assignment.totalWorkedMinutes || job.totalWorkedMinutes || 0);
      totalDriverWorkedMinutes += workedMins;

      const pricing = calculateDriverSessionPricing({
        pricingType: job.pricingType,
        hourlyRate: effectiveHourlyRate,
        baseHours: effectiveBaseHours,
        totalWorkedMinutes: workedMins,
        fixedPrice: job.fixedPrice,
        driverPriceType: job.driverPriceType,
        driverPrice: job.driverPrice,
        driverPricePercentage: job.driverPricePercentage,
        showDriverPrice: job.showDriverPrice,
        isCompleted: true,
        existingSnapshot: null,
      });

      // Check if per-driver manual override was provided
      if (dtMatch && dtMatch.manualDriverPayout !== undefined && dtMatch.manualDriverPayout !== null && dtMatch.manualDriverPayout !== '') {
        const manualAmt = Math.max(0, Number(dtMatch.manualDriverPayout));
        pricing.finalDriverAmount = manualAmt;
        pricing.isManualOverride = true;
      } else if (manualDriverPayout !== undefined && manualDriverPayout !== null && manualDriverPayout !== '') {
        const manualAmt = Math.max(0, Number(manualDriverPayout));
        pricing.finalDriverAmount = manualAmt;
        pricing.isManualOverride = true;
      }

      assignment.pricingSnapshot = pricing;
      totalDriverFinalAmount += Number(pricing.finalDriverAmount || 0);
      totalOvertimeMinutes += Number(pricing.overtimeMinutes || 0);
      totalOvertimeAmount += Number(pricing.overtimeAmount || 0);
    });

    if (manualDriverPayout !== undefined && manualDriverPayout !== null && manualDriverPayout !== '') {
      const manualAmt = Math.max(0, Number(manualDriverPayout));
      recordChange('driverPrice', 'Manual Driver Payout Override', job.driverPrice, manualAmt);
      job.driverPrice = manualAmt;
    }

    if (!job.billing) job.billing = {};
    const oldExtra = Number(job.billing.extraCharges || 0);
    const oldDiscount = Number(job.billing.discount || 0);
    const newExtra = extraCharges !== undefined ? Number(extraCharges) : oldExtra;
    const newDiscount = discount !== undefined ? Number(discount) : oldDiscount;

    if (extraCharges !== undefined) recordChange('billing.extraCharges', 'Extra Charges', oldExtra, newExtra);
    if (extraChargeNotes !== undefined) {
      recordChange('billing.extraChargeNotes', 'Extra Charge Notes', job.billing.extraChargeNotes, extraChargeNotes);
      job.billing.extraChargeNotes = extraChargeNotes;
    }
    if (discount !== undefined) recordChange('billing.discount', 'Discount', oldDiscount, newDiscount);

    job.billing.extraCharges = newExtra;
    job.billing.discount = newDiscount;

    let customerLaborCost = 0;
    if (job.pricingType === 'hourly') {
      const workedMins = job.totalWorkedMinutes || 0;
      const baseMins = effectiveBaseHours * 60;
      const baseCost = effectiveHourlyRate * effectiveBaseHours;
      const otMins = Math.max(0, workedMins - baseMins);
      const otBlocks = Math.ceil(otMins / 30);
      const otCost = otBlocks * (effectiveHourlyRate / 2);
      customerLaborCost = baseCost + otCost;
    } else {
      customerLaborCost = Number(job.fixedPrice || 0);
    }

    job.billing.laborCost = customerLaborCost;
    const fuelCharges = Number(job.billing.fuelCharges || 0);
    const tollCharges = Number(job.billing.tollCharges || 0);
    const subtotal = customerLaborCost + newExtra + fuelCharges + tollCharges - newDiscount;
    const gst = job.includeGST ? Math.round(subtotal * (Number(job.gstRate || 10) / 100) * 100) / 100 : 0;
    
    let finalTotal = Math.max(0, Math.round((subtotal + gst) * 100) / 100);
    if (manualCustomerTotal !== undefined && manualCustomerTotal !== null && manualCustomerTotal !== '') {
      finalTotal = Math.max(0, Number(manualCustomerTotal));
      recordChange('billing.totalAmount', 'Manual Customer Total Override', job.billing.totalAmount, finalTotal);
    } else {
      recordChange('billing.totalAmount', 'Customer Total Amount', job.billing.totalAmount, finalTotal);
    }
    job.billing.gst = gst;
    job.billing.totalAmount = finalTotal;

    if (paymentMethod !== undefined) {
      recordChange('paymentMethod', 'Payment Method', job.paymentMethod, paymentMethod);
      job.paymentMethod = paymentMethod;
    }
    if (amountReceived !== undefined) {
      const newAmt = amountReceived !== '' && amountReceived !== null ? Number(amountReceived) : null;
      recordChange('amountReceived', 'Amount Received', job.amountReceived, newAmt);
      job.amountReceived = newAmt;
    }
    if (transactionReference !== undefined) {
      recordChange('transactionReference', 'Transaction Reference', job.transactionReference, transactionReference);
      job.transactionReference = transactionReference;
      job.paymentTransactionReference = transactionReference;
    }
    if (paymentNotes !== undefined) {
      recordChange('paymentNotes', 'Payment Notes', job.paymentNotes, paymentNotes);
      job.paymentNotes = paymentNotes;
    }
    if (completionNotes !== undefined) {
      recordChange('completionNotes', 'Completion Notes', job.completionNotes, completionNotes);
      job.completionNotes = completionNotes;
      if (job.completion) job.completion.completionNotes = completionNotes;
    }

    if (!job.adjustments) job.adjustments = [];
    const adjustmentEntry = {
      adjustedAt: new Date(),
      adjustedBy: req.user?._id || null,
      adjustedByName: req.user?.name || 'Admin',
      adjustedByRole: req.user?.role || 'admin',
      reason: reason.trim(),
      changes,
      recalculatedPricing: {
        totalWorkedMinutes: job.totalWorkedMinutes || 0,
        overtimeMinutes: totalOvertimeMinutes,
        overtimeAmount: totalOvertimeAmount,
        finalDriverAmount: totalDriverFinalAmount,
        customerTotalAmount: finalTotal,
      },
    };
    job.adjustments.push(adjustmentEntry);

    job.timeline.push({
      action: 'Completed Job Adjusted',
      performedBy: req.user?._id || null,
      notes: `Reason: ${reason.trim()} (${changes.length} field(s) adjusted)`,
      timestamp: new Date(),
    });

    job.updatedBy = req.user?._id || null;
    job.updatedByName = req.user?.name || null;

    await job.save();

    return sendResponse(res, 200, {
      job: normalizeJobForResponse(job),
      adjustment: adjustmentEntry,
    }, 'Completed job adjusted and recalculated successfully.');
  } catch (error) {
    next(error);
  }
};


