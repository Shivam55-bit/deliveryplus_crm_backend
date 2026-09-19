import Driver from '../models/Driver.js';
import Notification from '../models/Notification.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';
import { createAndSendDriverNotification } from '../services/pushNotificationService.js';

const normalizeDriverNotification = (notification) => {
  if (!notification) return null;
  return {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    job: notification.job,
    data: notification.data || {},
    isRead: notification.isRead,
    readAt: notification.readAt,
    sentStatus: notification.sentStatus,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
};

export const registerDriverFcmToken = async (req, res, next) => {
  try {
    const { token, platform, deviceId } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return sendError(res, 400, 'FCM token is required.');
    }
    if (!['ios', 'android'].includes(platform)) {
      return sendError(res, 400, 'Platform must be ios or android.');
    }

    const normalizedToken = token.trim();
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    driver.fcmTokens = Array.isArray(driver.fcmTokens) ? driver.fcmTokens : [];

    await Driver.updateMany(
      { 'fcmTokens.token': normalizedToken },
      { $pull: { fcmTokens: { token: normalizedToken } } }
    );

    const existingTokenIndex = driver.fcmTokens.findIndex((entry) => entry.token === normalizedToken);
    if (existingTokenIndex >= 0) {
      driver.fcmTokens[existingTokenIndex].platform = platform;
      driver.fcmTokens[existingTokenIndex].deviceId = deviceId || null;
      driver.fcmTokens[existingTokenIndex].updatedAt = new Date();
    } else {
      driver.fcmTokens.push({
        token: normalizedToken,
        platform,
        deviceId: deviceId || null,
        updatedAt: new Date(),
      });
    }

    await driver.save();

    sendResponse(res, 200, { success: true }, 'FCM token registered successfully.');
  } catch (error) {
    next(error);
  }
};

export const removeDriverFcmToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      return sendError(res, 400, 'FCM token is required.');
    }

    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    driver.fcmTokens = (driver.fcmTokens || []).filter((entry) => entry.token !== normalizedToken);
    await driver.save();

    sendResponse(res, 200, { success: true }, 'FCM token removed successfully.');
  } catch (error) {
    next(error);
  }
};

export const getDriverNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, unreadOnly } = req.query;
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    const filter = { recipientDriver: driver._id };
    if (type) filter.type = type;
    if (unreadOnly === 'true' || unreadOnly === '1') filter.isRead = false;

    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .populate('job', 'jobNumber customerName pickupAddress dropAddress status')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const unreadCount = await Notification.countDocuments({ recipientDriver: driver._id, isRead: false });

    sendResponse(res, 200, {
      notifications: notifications.map(normalizeDriverNotification),
      unreadCount,
      pagination: buildPaginationMeta(total, page, limit),
    }, 'Notifications retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

export const getDriverNotificationUnreadCount = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    const unreadCount = await Notification.countDocuments({ recipientDriver: driver._id, isRead: false });
    sendResponse(res, 200, { unreadCount }, 'Unread notification count retrieved.');
  } catch (error) {
    next(error);
  }
};

export const markDriverNotificationAsRead = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      recipientDriver: driver._id,
    });

    if (!notification) {
      return sendError(res, 404, 'Notification not found.');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    const unreadCount = await Notification.countDocuments({ recipientDriver: driver._id, isRead: false });
    sendResponse(res, 200, { unreadCount, notification: normalizeDriverNotification(notification) }, 'Notification marked as read.');
  } catch (error) {
    next(error);
  }
};

export const markAllDriverNotificationsAsRead = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    await Notification.updateMany(
      { recipientDriver: driver._id, isRead: false },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    sendResponse(res, 200, { unreadCount: 0 }, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

export const createAdminDriverNotification = async (req, res, next) => {
  try {
    const { driverIds = [], title, message, jobId = null, sendToAllDrivers = false } = req.body;

    if (!title || !message) {
      return sendError(res, 400, 'Title and message are required.');
    }

    const maxRecipients = 50;
    let candidateDriverIds = Array.isArray(driverIds) ? driverIds : [];
    if (sendToAllDrivers) {
      const allDrivers = await Driver.find({ isActive: true }).select('userId');
      candidateDriverIds = allDrivers.map((driver) => String(driver.userId));
    }

    candidateDriverIds = [...new Set(candidateDriverIds.map((value) => String(value)).filter(Boolean))];
    if (candidateDriverIds.length === 0) {
      return sendError(res, 400, 'At least one driver recipient is required.');
    }

    if (candidateDriverIds.length > maxRecipients) {
      return sendError(res, 400, `Maximum ${maxRecipients} recipients allowed per request.`);
    }

    const summary = {
      requested: candidateDriverIds.length,
      sent: 0,
      failed: 0,
      noToken: 0,
      skipped: 0,
    };

    for (const driverId of candidateDriverIds) {
      const result = await createAndSendDriverNotification({
        driverId,
        type: 'ADMIN_MESSAGE',
        title,
        message,
        jobId,
        data: {
          screen: 'Notifications',
        },
        deduplicationKey: `ADMIN_MESSAGE:${jobId || 'broadcast'}:${driverId}:${String(req.body.requestId || '')}`,
      });

      if (result.status === 'sent') summary.sent += 1;
      if (result.status === 'failed') summary.failed += 1;
      if (result.status === 'no_token') summary.noToken += 1;
      if (result.status === 'skipped') summary.skipped += 1;
    }

    sendResponse(res, 200, { summary }, 'Admin driver notification request processed.');
  } catch (error) {
    next(error);
  }
};

export const createTestDriverNotification = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return sendError(res, 403, 'Test notification endpoint is disabled in production.');
    }

    const { driverId, title, message } = req.body;
    if (!driverId || !title || !message) {
      return sendError(res, 400, 'driverId, title and message are required.');
    }

    const result = await createAndSendDriverNotification({
      driverId,
      type: 'ADMIN_MESSAGE',
      title,
      message,
      data: {
        screen: 'Notifications',
      },
      deduplicationKey: `TEST_NOTIFICATION:${driverId}:${Date.now()}`,
    });

    sendResponse(res, 200, { result }, 'Test notification sent.');
  } catch (error) {
    next(error);
  }
};
