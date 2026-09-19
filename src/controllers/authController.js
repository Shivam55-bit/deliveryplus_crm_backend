import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { sendResponse, sendError } from '../utils/response.js';

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpire }
  );
  const refreshToken = jwt.sign(
    { id: user._id },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpire }
  );
  return { accessToken, refreshToken };
};

const enrichUserWithDriverProfile = async (user) => {
  const baseUser = user.toObject ? user.toObject() : { ...user };
  const userRole = String(baseUser.role || '').toLowerCase().replace(/[-_]/g, '');

  if (userRole === 'superadmin' || baseUser.email === 'admin@hubcrm.com' || (userRole === 'admin' && !baseUser.createdBy)) {
    baseUser.role = 'super_admin';
    baseUser.permissions = ['*'];
    return baseUser;
  }

  if (userRole === 'admin' || userRole === 'manager') {
    baseUser.role = 'admin';
    baseUser.permissions = Array.isArray(baseUser.permissions) ? baseUser.permissions : [];
    return baseUser;
  }

  if (baseUser.role !== 'driver') {
    return baseUser;
  }

  const driverProfile = await Driver.findOne({ userId: user._id || baseUser._id }).select('-fcmTokens').lean();

  return {
    ...baseUser,
    approvalStatus: driverProfile?.approvalStatus || 'approved',
    isApproved: typeof driverProfile?.isApproved === 'boolean' ? driverProfile.isApproved : true,
    verificationStatus: driverProfile?.verificationStatus || 'verified',
    documents: driverProfile?.documents || [],
  };
};

const createUserWithRole = async (req, res, next, role) => {
  try {
    const { name, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already registered.');
    }

    const user = await User.create({ name, email, password, role, phone });

    if (role === 'driver') {
      await Driver.create({ userId: user._id });
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    sendResponse(res, 201, { user, ...tokens }, 'Registration successful.');
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already registered.');
    }

    const user = await User.create({ name, email, password, role, phone });

    // If role is driver, also create a Driver profile
    if (role === 'driver') {
      await Driver.create({ userId: user._id });
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    const userPayload = await enrichUserWithDriverProfile(user);
    sendResponse(res, 201, { user: userPayload, ...tokens }, 'Registration successful.');
  } catch (error) {
    next(error);
  }
};

export const registerAdmin = async (req, res, next) => createUserWithRole(req, res, next, 'admin');
export const registerDriver = async (req, res, next) => createUserWithRole(req, res, next, 'driver');

const loginWithRole = async (req, res, next, expectedRole) => {
  try {
    const { email, password } = req.body;
    console.log(`[AUTH] login request: email=${email} expectedRole=${expectedRole || 'any'}`);

    const user = await User.findOne({ email });
    if (!user) {
      console.log('[AUTH] login failure - user not found', { email });
      return sendError(res, 401, 'Invalid email or password.');
    }

    if (expectedRole) {
      const userNorm = String(user.role || '').toLowerCase().replace(/[-_]/g, '');
      const expNorm = String(expectedRole || '').toLowerCase().replace(/[-_]/g, '');

      let matches = false;
      if (expNorm === 'admin' || expNorm === 'superadmin') {
        matches = ['admin', 'superadmin', 'manager'].includes(userNorm);
      } else {
        matches = userNorm === expNorm;
      }

      if (!matches) {
        console.log('[AUTH] login failure - role mismatch', {
          email,
          role: user.role,
          expectedRole,
        });
        return sendError(res, 401, 'Invalid email or password.');
      }
    }

    if (user.isActive === false) {
      console.log('[AUTH] login failure - account disabled', { email });
      return sendError(res, 403, 'Your account is disabled. Please contact support.');
    }

    const isMatch = await user.comparePassword(password);
    console.log(`[AUTH] password compare for ${email}: ${isMatch}`);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    const tokens = generateTokens(user);
    console.log(`[AUTH] JWT generated for ${email} role=${user.role}`);
    user.refreshToken = tokens.refreshToken;
    user.lastLogin = new Date();
    await user.save();

    const userPayload = await enrichUserWithDriverProfile(user);
    sendResponse(res, 200, { user: userPayload, ...tokens }, 'Login successful.');
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => loginWithRole(req, res, next);
export const loginAdmin = async (req, res, next) => loginWithRole(req, res, next, 'admin');
export const loginDriver = async (req, res, next) => loginWithRole(req, res, next, 'driver');

export const resetLoginAttempts = async (req, res) => {
  // Lockouts are completely disabled; return immediate success
  sendResponse(res, 200, {}, 'Login lockouts are disabled. You can login directly.');
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return sendError(res, 400, 'Refresh token is required.');

    const decoded = jwt.verify(token, config.jwtRefreshSecret);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== token) {
      return sendError(res, 401, 'Invalid refresh token.');
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    sendResponse(res, 200, tokens, 'Token refreshed.');
  } catch (error) {
    return sendError(res, 401, 'Invalid or expired refresh token.');
  }
};

export const getMe = async (req, res) => {
  const userPayload = await enrichUserWithDriverProfile(req.user);
  sendResponse(res, 200, { user: userPayload });
};
