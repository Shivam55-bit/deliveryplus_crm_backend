import Notification from '../models/Notification.js';
import DeviceToken from '../models/DeviceToken.js';
import Driver from '../models/Driver.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';
import { createAndSendDriverNotification, sendPushToUser } from '../services/pushNotificationService.js';

const normalizeNotificationForAdmin = (notification) => ({
  _id: notification._id,
  title: notification.title,
  message: notification.message || notification.body,
  type: notification.type,
  jobId: notification.jobId || notification.job,
  data: notification.data || {},
  isRead: notification.isRead,
  readAt: notification.readAt,
  pushStatus: notification.pushStatus || notification.sentStatus,
  pushError: notification.pushError || notification.failureReason,
  sentAt: notification.sentAt,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
  recipientId: notification.recipientId,
  recipientDriver: notification.recipientDriver,
});

export const getAdminNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (search) {
      const searchValue = String(search).trim();
      filter.$or = [
        { title: { $regex: searchValue, $options: 'i' } },
        { message: { $regex: searchValue, $options: 'i' } },
        { body: { $regex: searchValue, $options: 'i' } },
      ];
    }

    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .populate({ path: 'recipientDriver', populate: { path: 'userId', select: 'name email' } })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    sendResponse(res, 200, {
      notifications: notifications.map(normalizeNotificationForAdmin),
      pagination: buildPaginationMeta(total, page, limit),
    }, 'Admin notifications retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

export const getAdminNotificationStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const registeredDevices = await DeviceToken.countDocuments({ isActive: true });
    const sentToday = await Notification.countDocuments({ createdAt: { $gte: today }, pushStatus: 'sent' });
    const failedToday = await Notification.countDocuments({ createdAt: { $gte: today }, pushStatus: 'failed' });
    const noDeviceToday = await Notification.countDocuments({ createdAt: { $gte: today }, pushStatus: 'no_device' });
    const unreadNotifications = await Notification.countDocuments({ isRead: false });

    sendResponse(res, 200, {
      registeredDevices,
      sentToday,
      failedToday,
      noDeviceToday,
      unreadNotifications,
    }, 'Admin notification stats retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

export const sendManualNotification = async (req, res, next) => {
  try {
    const { driverId, title, message, jobId } = req.body;
    if (!driverId || !title || !message) {
      return sendError(res, 400, 'driverId, title, and message are required.');
    }

    const driver = await Driver.findOne({ $or: [{ _id: driverId }, { userId: driverId }] });
    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    const result = await sendPushToUser(driver.userId, {
      title,
      body: message,
      type: 'GENERAL',
      jobId: jobId || null,
      data: { screen: 'Notifications' },
    });

    sendResponse(res, 200, { result }, 'Manual notification processed.');
  } catch (error) {
    next(error);
  }
};

export const getDriverPushStatus = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findOne({ $or: [{ _id: driverId }, { userId: driverId }] });
    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    const activeDevices = await DeviceToken.find({ userId: driver.userId, isActive: true }).sort({ lastUsedAt: -1 }).lean();
    const recentNotifications = await Notification.find({ recipientDriver: driver._id }).sort({ createdAt: -1 }).limit(5).lean();

    sendResponse(res, 200, {
      driverId: driver._id,
      userId: driver.userId,
      deviceRegistered: activeDevices.length > 0,
      deviceCount: activeDevices.length,
      platform: activeDevices[0]?.platform || null,
      lastTokenUpdate: activeDevices[0]?.lastUsedAt || null,
      recentNotifications: recentNotifications.map((notification) => ({
        _id: notification._id,
        title: notification.title,
        pushStatus: notification.pushStatus || notification.sentStatus,
        pushError: notification.pushError || notification.failureReason,
        createdAt: notification.createdAt,
      })),
    }, 'Driver push status retrieved.');
  } catch (error) {
    next(error);
  }
};

export const createAdminNotification = async (req, res, next) => {
  try {
    const { driverIds = [], title, message, jobId } = req.body;
    if (!title || !message) {
      return sendError(res, 400, 'Title and message are required.');
    }

    const driverRecipients = Array.isArray(driverIds) ? driverIds.filter(Boolean) : [];
    const results = [];
    for (const driverId of driverRecipients) {
      const result = await createAndSendDriverNotification({
        driverId,
        type: 'GENERAL',
        title,
        message,
        jobId,
        data: { screen: 'Notifications' },
        deduplicationKey: `ADMIN_NOTIFICATION:${jobId || 'broadcast'}:${driverId}:${Date.now()}`,
      });
      results.push({ driverId, result });
    }

    sendResponse(res, 200, { results }, 'Admin notification request processed.');
  } catch (error) {
    next(error);
  }
};

export const markAllAdminNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    sendResponse(res, 200, { updatedCount: result.modifiedCount }, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

