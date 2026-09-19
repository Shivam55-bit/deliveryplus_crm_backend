import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import { sendError } from '../utils/response.js';

export const isSuperAdminRole = (role, user) => {
  const r = String(role || '').toLowerCase().replace(/[-_]/g, '');
  if (r === 'superadmin') return true;
  if (user?.email === 'admin@hubcrm.com') return true;
  if (r === 'admin' && !user?.createdBy) return true;
  return false;
};

export const isSuperAdmin = (user) => {
  return isSuperAdminRole(user?.role, user);
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return sendError(res, 401, 'Access denied. No token provided.');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user || user.isActive === false) {
      return sendError(res, 401, 'Invalid or expired token, or account is disabled.');
    }

    req.user = user;
    next();
  } catch (error) {
    return sendError(res, 401, 'Invalid or expired token.');
  }
};

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !isSuperAdmin(req.user)) {
    return sendError(res, 403, 'Access denied. Super Admin privileges required.');
  }
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = String(req.user?.role || '').toLowerCase();
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const normalizedRoles = roles.map((r) => String(r).toLowerCase().replace(/[-_]/g, ''));
    const currentNormalized = userRole.replace(/[-_]/g, '');

    if (!normalizedRoles.includes(currentNormalized)) {
      return sendError(res, 403, 'Not authorized to access this resource.');
    }
    next();
  };
};

/**
 * Require one or more specific permissions.
 * Super Admin always passes.
 * Admin requires at least one of the listed permissions (or '*' wildcard).
 */
export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required.');
    }

    // Super Admin has unrestricted access to everything
    if (isSuperAdmin(req.user)) {
      return next();
    }

    const userRole = String(req.user.role || '').toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager') {
      return sendError(res, 403, 'Access denied.');
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

    // Wildcard permission granted
    if (userPermissions.includes('*') || userPermissions.includes('all')) {
      return next();
    }

    const hasAny = requiredPermissions.some((perm) => userPermissions.includes(perm));
    if (!hasAny) {
      return sendError(res, 403, 'You do not have permission to perform this action.');
    }

    next();
  };
};
