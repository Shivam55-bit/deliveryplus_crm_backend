import Notification from '../models/Notification.js';
import Driver from '../models/Driver.js';
import DeviceToken from '../models/DeviceToken.js';
import { messaging, isFirebaseConfigured } from '../config/firebase.js';

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const normalizeToken = (token) => String(token || '').trim();

const normalizePayloadValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const stringifyDataPayload = (data = {}) => {
  const normalized = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    normalized[key] = normalizePayloadValue(value);
  });
  return normalized;
};

const normalizeNotificationType = (type) => {
  if (!type || typeof type !== 'string') return 'GENERAL';
  const normalized = String(type).trim().toUpperCase();
  switch (normalized) {
    case 'JOB_ASSIGNED':
    case 'NEW_JOB':
      return 'NEW_JOB';
    case 'JOB_UPDATED':
      return 'JOB_UPDATED';
    case 'JOB_CANCELLED':
      return 'JOB_CANCELLED';
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_UPDATED':
      return 'PAYMENT_RECEIVED';
    case 'REMINDER':
      return 'REMINDER';
    case 'GENERAL':
    case 'ADMIN_MESSAGE':
      return 'GENERAL';
    case 'JOB_COMPLETED':
      return 'JOB_UPDATED';
    case 'PICKUP_REMINDER':
      return 'REMINDER';
    default:
      return normalized;
  }
};

const getDefaultScreen = (type, data = {}) => {
  const normalizedType = normalizeNotificationType(type);
  if (normalizedType === 'GENERAL') return 'Notifications';
  return String(data.screen || 'JobDetail');
};

const buildMessagePayload = ({ title, body, data, unreadCount = 0 }) => ({
  notification: {
    title,
    body,
  },
  data: stringifyDataPayload(data),
  android: {
    priority: 'high',
    notification: {
      sound: 'default',
      channelId: 'delivery-plus',
    },
  },
  apns: {
    payload: {
      aps: {
        sound: 'default',
        badge: Number(unreadCount) || 0,
      },
    },
  },
});

export const sendToTokens = async (tokens, payload) => {
  const uniqueTokens = [...new Set((Array.isArray(tokens) ? tokens : []).map((token) => normalizeToken(token)).filter(Boolean))];

  if (uniqueTokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [], tokenCount: 0 };
  }

  if (!messaging || !isFirebaseConfigured) {
    return { successCount: 0, failureCount: uniqueTokens.length, invalidTokens: [], tokenCount: uniqueTokens.length };
  }

  const result = await messaging.sendEachForMulticast({ ...payload, tokens: uniqueTokens });
  const invalidTokens = [];
  result.responses.forEach((response, index) => {
    if (response.error && INVALID_TOKEN_ERROR_CODES.has(response.error.code)) {
      invalidTokens.push(uniqueTokens[index]);
    }
  });

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    invalidTokens,
    tokenCount: uniqueTokens.length,
  };
};

export const deactivateInvalidTokens = async (userId, tokens) => {
  if (!userId || !Array.isArray(tokens) || tokens.length === 0) {
    return 0;
  }

  const normalizedInvalidTokens = [...new Set(tokens.map(normalizeToken).filter(Boolean))];
  if (normalizedInvalidTokens.length === 0) {
    return 0;
  }

  const result = await DeviceToken.updateMany(
    { userId, token: { $in: normalizedInvalidTokens } },
    { $set: { isActive: false, lastUsedAt: new Date() } }
  );

  return result.modifiedCount || 0;
};

export const sendPushToUser = async (userId, { title, body, type, jobId, data = {} }) => {
  if (!userId) {
    return { success: false, status: 'failed', reason: 'missing_user_id', successCount: 0, failureCount: 0, noDevice: true };
  }

  const driver = await Driver.findOne({ userId });
  if (!driver) {
    return { success: false, status: 'failed', reason: 'driver_not_found', successCount: 0, failureCount: 0, noDevice: true };
  }

  const normalizedType = normalizeNotificationType(type);
  const notification = await Notification.create({
    recipientId: userId,
    recipientDriver: driver._id,
    title,
    body,
    message: body || title,
    type: normalizedType,
    jobId: jobId || null,
    job: jobId || null,
    data: stringifyDataPayload({
      ...(data || {}),
      type: normalizedType,
      jobId: jobId ? String(jobId) : '',
      screen: getDefaultScreen(type, data),
    }),
    pushStatus: 'pending',
    sentStatus: 'pending',
  });

  const activeTokens = await DeviceToken.find({ userId, isActive: true }).lean();
  const tokens = activeTokens.map((entry) => entry.token);
  if (!tokens.length) {
    notification.pushStatus = 'no_device';
    notification.sentStatus = 'no_device';
    notification.pushError = 'No registered device tokens';
    notification.sentAt = new Date();
    await notification.save();
    return { success: false, status: 'no_device', reason: 'no_device', successCount: 0, failureCount: 0, noDevice: true, notification };
  }

  const unreadCount = await Notification.countDocuments({ recipientDriver: driver._id, isRead: false });
  const sendPayload = buildMessagePayload({
    title,
    body: body || title,
    data: {
      ...data,
      type: normalizedType,
      jobId: jobId ? String(jobId) : '',
      screen: getDefaultScreen(type, data),
    },
    unreadCount,
  });

  const sendResult = await sendToTokens(tokens, sendPayload);
  if (sendResult.invalidTokens.length) {
    await deactivateInvalidTokens(userId, sendResult.invalidTokens);
  }

  notification.pushStatus = sendResult.successCount > 0 ? 'sent' : 'failed';
  notification.sentStatus = sendResult.successCount > 0 ? (sendResult.failureCount > 0 ? 'partial' : 'sent') : 'failed';
  notification.pushError = sendResult.successCount > 0 ? null : 'Firebase send failed';
  notification.sentAt = new Date();
  await notification.save();

  return {
    success: sendResult.successCount > 0,
    status: sendResult.successCount > 0 ? (sendResult.failureCount > 0 ? 'partial' : 'sent') : 'failed',
    successCount: sendResult.successCount,
    failureCount: sendResult.failureCount,
    invalidTokens: sendResult.invalidTokens,
    tokenCount: sendResult.tokenCount,
    noDevice: false,
    notification,
  };
};

export const createAndSendDriverNotification = async ({
  driverId,
  type,
  title,
  message,
  jobId = null,
  data = {},
  deduplicationKey = null,
}) => {
  if (!driverId || !title || !message) {
    return { status: 'failed', reason: 'invalid_input' };
  }

  const driver = await Driver.findOne({ $or: [{ _id: driverId }, { userId: driverId }] });
  if (!driver) {
    return { status: 'failed', reason: 'driver_not_found' };
  }

  if (deduplicationKey) {
    const existing = await Notification.findOne({ deduplicationKey }).lean();
    if (existing) {
      return { status: 'skipped', reason: 'duplicate_notification', notificationId: existing._id };
    }
  }

  const normalizedType = normalizeNotificationType(type);
  const notification = await Notification.create({
    recipientId: driver.userId,
    recipientDriver: driver._id,
    title,
    body: message,
    message,
    type: normalizedType,
    jobId: jobId || null,
    job: jobId || null,
    data: stringifyDataPayload({
      ...(data || {}),
      type: normalizedType,
      jobId: jobId ? String(jobId) : '',
      screen: getDefaultScreen(type, data),
    }),
    pushStatus: 'pending',
    sentStatus: 'pending',
    deduplicationKey,
  });

  const activeTokens = await DeviceToken.find({ userId: driver.userId, isActive: true }).lean();
  const tokens = activeTokens.map((entry) => entry.token);

  if (!tokens.length) {
    notification.pushStatus = 'no_device';
    notification.sentStatus = 'no_device';
    notification.pushError = 'No registered device tokens';
    notification.sentAt = new Date();
    await notification.save();
    return { status: 'no_device', reason: 'no_device', notificationId: notification._id };
  }

  const unreadCount = await Notification.countDocuments({ recipientDriver: driver._id, isRead: false });
  const payload = buildMessagePayload({
    title,
    body: message,
    data: {
      ...data,
      type: normalizedType,
      jobId: jobId ? String(jobId) : '',
      screen: getDefaultScreen(type, data),
    },
    unreadCount,
  });

  const sendResult = await sendToTokens(tokens, payload);
  if (sendResult.invalidTokens.length) {
    await deactivateInvalidTokens(driver.userId, sendResult.invalidTokens);
  }

  notification.pushStatus = sendResult.successCount > 0 ? 'sent' : 'failed';
  notification.sentStatus = sendResult.successCount > 0 ? (sendResult.failureCount > 0 ? 'partial' : 'sent') : 'failed';
  notification.pushError = sendResult.successCount > 0 ? null : 'Firebase send failed';
  notification.sentAt = new Date();
  await notification.save();

  return {
    status: notification.sentStatus,
    reason: notification.pushError || null,
    notificationId: notification._id,
    successCount: sendResult.successCount,
    failureCount: sendResult.failureCount,
    tokenCount: sendResult.tokenCount,
  };
};
