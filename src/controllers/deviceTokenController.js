import DeviceToken from '../models/DeviceToken.js';
import Driver from '../models/Driver.js';
import { sendResponse, sendError } from '../utils/response.js';

export const registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform, deviceId, deviceName, appVersion } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return sendError(res, 400, 'Device token is required.');
    }

    const normalizedPlatform = String(platform || '').toLowerCase();
    if (!['ios', 'android'].includes(normalizedPlatform)) {
      return sendError(res, 400, 'Platform must be ios or android.');
    }

    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    const normalizedToken = token.trim();
    const existing = await DeviceToken.findOne({ token: normalizedToken });

    if (existing) {
      existing.userId = req.user._id;
      existing.platform = normalizedPlatform;
      existing.deviceId = deviceId || existing.deviceId || null;
      existing.deviceName = deviceName || existing.deviceName || null;
      existing.appVersion = appVersion || existing.appVersion || null;
      existing.isActive = true;
      existing.lastUsedAt = new Date();
      await existing.save();
    } else {
      await DeviceToken.create({
        userId: req.user._id,
        token: normalizedToken,
        platform: normalizedPlatform,
        deviceId: deviceId || null,
        deviceName: deviceName || null,
        appVersion: appVersion || null,
        isActive: true,
        lastUsedAt: new Date(),
      });
    }

    sendResponse(res, 200, { registered: true }, 'Device token registered successfully.');
  } catch (error) {
    next(error);
  }
};

export const unregisterDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return sendError(res, 400, 'Device token is required.');
    }

    const normalizedToken = token.trim();
    await DeviceToken.updateMany(
      { userId: req.user._id, token: normalizedToken },
      { $set: { isActive: false, lastUsedAt: new Date() } }
    );

    sendResponse(res, 200, { unregistered: true }, 'Device token unregistered successfully.');
  } catch (error) {
    next(error);
  }
};

export const unregisterAllDeviceTokens = async (req, res, next) => {
  try {
    await DeviceToken.updateMany(
      { userId: req.user._id },
      { $set: { isActive: false, lastUsedAt: new Date() } }
    );

    sendResponse(res, 200, { unregistered: true }, 'All device tokens unregistered successfully.');
  } catch (error) {
    next(error);
  }
};

export const getDeviceTokenStatus = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return sendError(res, 404, 'Driver profile not found.');
    }

    const activeTokens = await DeviceToken.find({ userId: req.user._id, isActive: true }).sort({ lastUsedAt: -1 }).lean();
    sendResponse(res, 200, {
      registeredDevices: activeTokens.length,
      devices: activeTokens.map((entry) => ({
        token: entry.token.slice(0, 12) + '...',
        platform: entry.platform,
        deviceId: entry.deviceId,
        deviceName: entry.deviceName,
        appVersion: entry.appVersion,
        lastUsedAt: entry.lastUsedAt,
      })),
    }, 'Device token status retrieved.');
  } catch (error) {
    next(error);
  }
};
