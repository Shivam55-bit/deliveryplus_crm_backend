import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { sendResponse, sendError } from '../utils/response.js';

// Admin: Add new driver
export const addDriver = async (req, res, next) => {
  try {
    const { name, email, password, phone, licenseNumber, vehicleNumber, vehicleTypes } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already registered.');
    }

    // Create user with driver role
    const user = await User.create({
      name,
      email,
      password,
      role: 'driver',
      phone,
    });

    // Create driver profile
    const driver = await Driver.create({
      userId: user._id,
      licenseNumber,
      vehicleNumber,
      vehicleTypes: vehicleTypes || [],
    });

    const populatedDriver = await Driver.findById(driver._id)
      .select('userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive createdAt updatedAt')
      .populate('userId', 'name email phone role');

    sendResponse(res, 201, { user, driver: populatedDriver }, 'Driver added successfully.');
  } catch (error) {
    next(error);
  }
};

// Get all drivers
export const getDrivers = async (req, res, next) => {
  try {
    const { availability, isActive } = req.query;
    const filter = { isActive: isActive !== 'false' };
    if (availability) filter.availability = availability;

    const drivers = await Driver.find(filter)
      .select('userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive createdAt updatedAt')
      .populate('userId', 'name email phone role')
      .sort({ createdAt: -1 });

    sendResponse(res, 200, { drivers });
  } catch (error) {
    next(error);
  }
};

// Get driver by ID
export const getDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate('userId', 'name email phone role');

    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    sendResponse(res, 200, { driver });
  } catch (error) {
    next(error);
  }
};

// Update driver
export const updateDriver = async (req, res, next) => {
  try {
    const { licenseNumber, vehicleNumber, vehicleTypes, availability } = req.body;

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
        licenseNumber,
        vehicleNumber,
        vehicleTypes,
        availability,
      },
      { new: true, runValidators: true }
    )
      .select('userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive createdAt updatedAt')
      .populate('userId', 'name email phone role');

    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    sendResponse(res, 200, { driver }, 'Driver updated successfully.');
  } catch (error) {
    next(error);
  }
};

// Delete/Deactivate driver
export const deleteDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    sendResponse(res, 200, { driver }, 'Driver deactivated successfully.');
  } catch (error) {
    next(error);
  }
};

// Get driver performance
export const getDriverPerformance = async (req, res, next) => {
  try {
    const drivers = await Driver.find()
      .populate('userId', 'name email')
      .select('userId totalJobs completedJobs rating');

    sendResponse(res, 200, { drivers });
  } catch (error) {
    next(error);
  }
};
