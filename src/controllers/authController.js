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

    sendResponse(res, 201, { user, ...tokens }, 'Registration successful.');
  } catch (error) {
    next(error);
  }
};

export const registerAdmin = async (req, res, next) => createUserWithRole(req, res, next, 'admin');
export const registerDriver = async (req, res, next) => createUserWithRole(req, res, next, 'driver');

const loginWithRole = async (req, res, next, expectedRole) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.isActive || (expectedRole && user.role !== expectedRole)) {
      return sendError(res, 401, 'Invalid credentials.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid credentials.');
    }

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    user.lastLogin = new Date();
    await user.save();

    sendResponse(res, 200, { user, ...tokens }, 'Login successful.');
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => loginWithRole(req, res, next);
export const loginAdmin = async (req, res, next) => loginWithRole(req, res, next, 'admin');
export const loginDriver = async (req, res, next) => loginWithRole(req, res, next, 'driver');

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
  sendResponse(res, 200, { user: req.user });
};
