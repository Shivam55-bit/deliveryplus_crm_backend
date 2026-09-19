import User from '../models/User.js';
import Driver from '../models/Driver.js';
import DeviceToken from '../models/DeviceToken.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';

export const getUsers = async (req, res, next) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    sendResponse(res, 200, { users, pagination: buildPaginationMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getDrivers = async (req, res, next) => {
  try {
    const { search } = req.query;

    // 1. Find all users with role 'driver'
    const userFilter = { role: 'driver' };
    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const driverUsers = await User.find(userFilter).select('-password -refreshToken').lean();
    
    // 2. Ensure each driver user has a corresponding Driver profile if missing
    for (const u of driverUsers) {
      try {
        await Driver.findOneAndUpdate(
          { userId: u._id },
          {
            $setOnInsert: {
              userId: u._id,
              availability: 'available',
              isApproved: true,
              approvalStatus: 'approved',
              verificationStatus: 'verified',
              isActive: true,
            }
          },
          { upsert: true, new: true }
        );
      } catch {
        // non-blocking
      }
    }

    // 3. Find all Driver documents that are not soft deleted
    const driverFilter = { isDeleted: { $ne: true } };
    const [drivers, activeDeviceTokens] = await Promise.all([
      Driver.find(driverFilter)
        .select('-fcmTokens')
        .populate('userId', 'name email phone avatar createdAt isActive role')
        .sort({ createdAt: -1 }),
      DeviceToken.find({ isActive: true }).sort({ lastUsedAt: -1 }).lean(),
    ]);

    const tokenMap = new Map();
    for (const token of activeDeviceTokens) {
      const uid = String(token.userId);
      if (!tokenMap.has(uid)) {
        tokenMap.set(uid, {
          deviceRegistered: true,
          deviceCount: 1,
          platform: token.platform || null,
          lastTokenUpdate: token.lastUsedAt || token.updatedAt || token.createdAt || null,
        });
      } else {
        const entry = tokenMap.get(uid);
        entry.deviceCount += 1;
      }
    }

    const enrichedDrivers = drivers
      .filter((d) => {
        // If search was provided, check populated user name/email or driver vehicle/license
        if (search) {
          const s = search.toLowerCase();
          const uName = (d.userId?.name || '').toLowerCase();
          const uEmail = (d.userId?.email || '').toLowerCase();
          const uPhone = (d.userId?.phone || '').toLowerCase();
          const dVehicle = (d.vehicleNumber || '').toLowerCase();
          const dLicense = (d.licenseNumber || '').toLowerCase();
          return uName.includes(s) || uEmail.includes(s) || uPhone.includes(s) || dVehicle.includes(s) || dLicense.includes(s);
        }
        return true;
      })
      .map((d) => {
        const plain = typeof d.toObject === 'function' ? d.toObject() : { ...d };
        const uid = String(plain.userId?._id || plain.userId || '');
        plain.pushStatus = tokenMap.get(uid) || {
          deviceRegistered: false,
          deviceCount: 0,
          platform: null,
          lastTokenUpdate: null,
        };
        // Normalize approval and approval status for old drivers
        if (!plain.approvalStatus) {
          plain.approvalStatus = plain.isApproved ? 'approved' : 'approved';
        }
        if (plain.isApproved === undefined) {
          plain.isApproved = true;
        }
        return plain;
      });

    sendResponse(res, 200, { drivers: enrichedDrivers });
  } catch (error) {
    next(error);
  }
};


export const createDriver = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      confirm,
      phone,
      licenseNumber,
      vehicleNumber,
      vehicleTypes,
      availability,
      approvalStatus,
      isApproved,
      verificationStatus,
      documents,
    } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 400, 'Name, email and password are required.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already registered.');
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'driver',
      phone,
    });

    const driver = await Driver.create({
      userId: user._id,
      licenseNumber,
      vehicleNumber,
      vehicleTypes,
      availability,
      approvalStatus: approvalStatus || 'pending',
      isApproved: typeof isApproved === 'boolean' ? isApproved : false,
      verificationStatus: verificationStatus || 'pending',
      documents: Array.isArray(documents) ? documents : [],
    });

    const populatedDriver = await driver.populate('userId', 'name email phone avatar');
    populatedDriver.set('fcmTokens', undefined, { strict: false });
    sendResponse(res, 201, { driver: populatedDriver, confirm }, 'Driver created.');
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const password = typeof req.body.password === 'string' ? req.body.password.trim() : '';

    if (password && !['admin', 'superAdmin'].includes(req.user?.role)) {
      return sendError(res, 403, 'You are not authorized to update driver passwords.');
    }

    // Managers can only update their own profile.
    if (req.user?.role !== 'admin' && req.user?.role !== 'superAdmin' && String(req.user?._id) !== String(id)) {
      return sendError(res, 403, 'Not authorized to update this user.');
    }

    const updates = { ...req.body };
    delete updates.role;

    if (password) {
      if (password.length < 8) {
        return sendError(res, 400, 'Password must be at least 8 characters long.');
      }
      updates.password = password;
    } else {
      delete updates.password;
    }

    const user = await User.findById(id);
    if (!user) return sendError(res, 404, 'User not found.');

    Object.assign(user, updates);
    await user.save();

    sendResponse(res, 200, { user }, 'User updated.');
  } catch (error) {
    next(error);
  }
};

export const updateDriverProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const driver = await Driver.findOneAndUpdate(
      { $or: [{ userId: id }, { _id: id }] },
      updates,
      { new: true, runValidators: true }
    ).select('-fcmTokens').populate('userId', 'name email phone');

    if (!driver) return sendError(res, 404, 'Driver profile not found.');
    sendResponse(res, 200, { driver }, 'Driver profile updated.');
  } catch (error) {
    next(error);
  }
};

export const deleteDriverAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    await User.findByIdAndUpdate(driver.userId, { isActive: false });

    sendResponse(res, 200, { driver }, 'Driver account deactivated successfully.');
  } catch (error) {
    next(error);
  }
};
