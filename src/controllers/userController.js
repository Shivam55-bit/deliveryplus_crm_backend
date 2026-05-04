import User from '../models/User.js';
import Driver from '../models/Driver.js';
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
    const { availability, search } = req.query;
    const userFilter = { role: 'driver', isActive: true };
    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const driverUsers = await User.find(userFilter).select('-password -refreshToken');
    const driverIds = driverUsers.map(u => u._id);

    const driverFilter = { userId: { $in: driverIds } };
    if (availability) driverFilter.availability = availability;

    const drivers = await Driver.find(driverFilter).populate('userId', 'name email phone avatar');

    sendResponse(res, 200, { drivers });
  } catch (error) {
    next(error);
  }
};

export const createDriver = async (req, res, next) => {
  try {
    const { name, email, password, confirm, phone, licenseNumber, vehicleNumber, vehicleTypes, availability } = req.body;

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
    });

    const populatedDriver = await driver.populate('userId', 'name email phone avatar');
    sendResponse(res, 201, { driver: populatedDriver, confirm }, 'Driver created.');
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Managers can only update their own profile.
    if (req.user?.role !== 'admin' && String(req.user?._id) !== String(id)) {
      return sendError(res, 403, 'Not authorized to update this user.');
    }

    const updates = req.body;
    delete updates.password;
    delete updates.role;

    const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!user) return sendError(res, 404, 'User not found.');

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
      { userId: id },
      updates,
      { new: true, runValidators: true }
    ).populate('userId', 'name email phone');

    if (!driver) return sendError(res, 404, 'Driver profile not found.');
    sendResponse(res, 200, { driver }, 'Driver profile updated.');
  } catch (error) {
    next(error);
  }
};
