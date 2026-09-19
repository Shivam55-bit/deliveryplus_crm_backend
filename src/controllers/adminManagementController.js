import User from '../models/User.js';
import Job from '../models/Job.js';
import ActivityLog from '../models/ActivityLog.js';
import { sendResponse, sendError } from '../utils/response.js';
import { isSuperAdmin } from '../middleware/auth.js';

const logAdminAudit = async ({ actor, action, targetUser, details, metadata = {} }) => {
  try {
    await ActivityLog.create({
      userId: actor?._id || actor?.id,
      actorId: actor?._id || actor?.id,
      actorName: actor?.name || 'Super Admin',
      actorRole: isSuperAdmin(actor) ? 'super_admin' : (actor?.role || 'admin'),
      action,
      entity: 'User',
      entityType: 'Admin',
      entityId: targetUser?._id || targetUser?.id,
      details,
      metadata: {
        targetUserId: targetUser?._id,
        targetUserName: targetUser?.name,
        targetUserEmail: targetUser?.email,
        ...metadata,
      },
    });
  } catch (err) {
    console.error('[AdminAudit] Failed to create activity log:', err.message);
  }
};

/**
 * List all Admin & Super Admin users with summary statistics
 */
export const listAdmins = async (req, res, next) => {
  try {
    const { search, status, role } = req.query;

    const query = {
      role: { $in: ['admin', 'manager', 'super_admin', 'superAdmin'] },
    };

    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    if (role) {
      const r = String(role).toLowerCase().replace(/[-_]/g, '');
      if (r === 'superadmin') {
        query.role = { $in: ['super_admin', 'superAdmin'] };
      } else if (r === 'admin') {
        query.role = { $in: ['admin', 'manager'] };
      }
    }

    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const admins = await User.find(query)
      .select('-password -refreshToken')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .lean();

    // Aggregate job creation counts for each admin
    const adminIds = admins.map((a) => a._id);
    const jobCounts = await Job.aggregate([
      { $match: { createdBy: { $in: adminIds } } },
      { $group: { _id: '$createdBy', total: { $sum: 1 } } },
    ]);

    const countMap = new Map();
    jobCounts.forEach((jc) => {
      countMap.set(String(jc._id), jc.total);
    });

    const enrichedAdmins = admins.map((admin) => {
      const isSuper = isSuperAdmin(admin);
      const permissions = isSuper ? ['*'] : (Array.isArray(admin.permissions) ? admin.permissions : []);

      return {
        ...admin,
        role: isSuper ? 'super_admin' : 'admin',
        permissions,
        permissionsCount: isSuper ? 'Full Access' : permissions.length,
        jobsCreatedCount: countMap.get(String(admin._id)) || 0,
      };
    });

    sendResponse(res, 200, { admins: enrichedAdmins }, 'Admins retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed profile, work summary, and activity of a single admin
 */
export const getAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const admin = await User.findById(id)
      .select('-password -refreshToken')
      .populate('createdBy', 'name email role')
      .lean();

    if (!admin) {
      return sendError(res, 404, 'Admin not found.');
    }

    const isSuper = isSuperAdmin(admin);
    const permissions = isSuper ? ['*'] : (Array.isArray(admin.permissions) ? admin.permissions : []);

    // Work summary metrics
    const [totalJobs, quotations, confirmed, cancelled, lastJob] = await Promise.all([
      Job.countDocuments({ createdBy: admin._id }),
      Job.countDocuments({ createdBy: admin._id, bookingStatus: 'quotation' }),
      Job.countDocuments({ createdBy: admin._id, bookingStatus: 'confirmed' }),
      Job.countDocuments({ createdBy: admin._id, status: 'cancelled' }),
      Job.findOne({ createdBy: admin._id }).sort({ createdAt: -1 }).select('jobNumber customerName bookingStatus status createdAt').lean(),
    ]);

    // Recent activity
    const recentActivity = await ActivityLog.find({
      $or: [{ actorId: admin._id }, { userId: admin._id }, { entityId: admin._id }],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const result = {
      ...admin,
      role: isSuper ? 'super_admin' : 'admin',
      permissions,
      workSummary: {
        totalJobsCreated: totalJobs,
        quotationsCreated: quotations,
        confirmedJobs: confirmed,
        cancelledJobs: cancelled,
        lastJobCreated: lastJob || null,
      },
      recentActivity,
    };

    sendResponse(res, 200, result, 'Admin details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Super Admin creates a new Admin user
 */
export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, permissions = [], isActive = true } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 400, 'Name, email, and password are required.');
    }

    if (String(password).length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters.');
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return sendError(res, 400, 'A user with this email already exists.');
    }

    // Filter and sanitize permissions
    const sanitizedPermissions = Array.isArray(permissions)
      ? permissions.filter((p) => typeof p === 'string' && p.trim() && p !== 'admins.manage')
      : [];

    const newAdmin = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : undefined,
      password,
      role: 'admin',
      permissions: sanitizedPermissions,
      isActive: Boolean(isActive),
      createdBy: req.user._id,
      creatorNameSnapshot: req.user.name,
    });

    await logAdminAudit({
      actor: req.user,
      action: 'ADMIN_CREATED',
      targetUser: newAdmin,
      details: `Created Admin account for ${newAdmin.name} (${newAdmin.email}) with ${sanitizedPermissions.length} permissions`,
      metadata: { permissions: sanitizedPermissions },
    });

    const userObj = newAdmin.toJSON();
    sendResponse(res, 201, { admin: userObj }, 'Admin created successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update Admin general details
 */
export const updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;

    const admin = await User.findById(id);
    if (!admin) {
      return sendError(res, 404, 'Admin not found.');
    }

    if (email && email.trim().toLowerCase() !== admin.email) {
      const emailExists = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: admin._id },
      });
      if (emailExists) {
        return sendError(res, 400, 'This email address is already in use by another user.');
      }
      admin.email = email.trim().toLowerCase();
    }

    if (name) admin.name = name.trim();
    if (phone !== undefined) admin.phone = phone ? phone.trim() : undefined;

    await admin.save();

    await logAdminAudit({
      actor: req.user,
      action: 'ADMIN_UPDATED',
      targetUser: admin,
      details: `Updated personal details for Admin ${admin.name} (${admin.email})`,
    });

    sendResponse(res, 200, { admin: admin.toJSON() }, 'Admin updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle Admin active / inactive status
 */
export const updateAdminStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return sendError(res, 400, 'isActive boolean field is required.');
    }

    const admin = await User.findById(id);
    if (!admin) {
      return sendError(res, 404, 'Admin not found.');
    }

    // Protect Super Admin from deactivating own active session
    if (String(admin._id) === String(req.user._id) && !isActive) {
      return sendError(res, 400, 'You cannot deactivate your own Super Admin account.');
    }

    admin.isActive = isActive;
    await admin.save();

    await logAdminAudit({
      actor: req.user,
      action: 'ADMIN_STATUS_CHANGED',
      targetUser: admin,
      details: `Set Admin ${admin.name} status to ${isActive ? 'ACTIVE' : 'INACTIVE'}`,
      metadata: { isActive },
    });

    sendResponse(
      res,
      200,
      { admin: admin.toJSON() },
      `Admin successfully ${isActive ? 'activated' : 'deactivated'}.`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Update Admin permissions with full audit trail of added & removed permissions
 */
export const updateAdminPermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissions = [] } = req.body;

    const admin = await User.findById(id);
    if (!admin) {
      return sendError(res, 404, 'Admin not found.');
    }

    if (isSuperAdmin(admin)) {
      return sendError(res, 400, 'Super Admin accounts always have unrestricted permissions.');
    }

    const oldPerms = new Set(admin.permissions || []);
    const newPerms = new Set(
      (Array.isArray(permissions) ? permissions : []).filter(
        (p) => typeof p === 'string' && p.trim() && p !== 'admins.manage'
      )
    );

    const added = [...newPerms].filter((p) => !oldPerms.has(p));
    const removed = [...oldPerms].filter((p) => !newPerms.has(p));

    admin.permissions = [...newPerms];
    await admin.save();

    await logAdminAudit({
      actor: req.user,
      action: 'PERMISSIONS_CHANGED',
      targetUser: admin,
      details: `Updated permissions for Admin ${admin.name}: +${added.length} added, -${removed.length} removed (Total: ${admin.permissions.length})`,
      metadata: { added, removed, current: admin.permissions },
    });

    sendResponse(
      res,
      200,
      {
        admin: admin.toJSON(),
        diff: { added, removed, total: admin.permissions.length },
      },
      'Permissions updated successfully.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password for an Admin
 */
export const resetAdminPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return sendError(res, 400, 'New password must be at least 6 characters.');
    }

    const admin = await User.findById(id);
    if (!admin) {
      return sendError(res, 404, 'Admin not found.');
    }

    admin.password = newPassword;
    await admin.save();

    await logAdminAudit({
      actor: req.user,
      action: 'PASSWORD_RESET',
      targetUser: admin,
      details: `Password was reset by Super Admin for ${admin.name} (${admin.email})`,
    });

    sendResponse(res, 200, {}, 'Admin password reset successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get all activity logs for an Admin
 */
export const getAdminActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const skip = (page - 1) * limit;

    const query = {
      $or: [{ actorId: id }, { userId: id }, { entityId: id }],
    };

    const [logs, total] = await Promise.all([
      ActivityLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(query),
    ]);

    sendResponse(
      res,
      200,
      {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      'Activity logs retrieved.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get all jobs created by an Admin
 */
export const getAdminJobs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const skip = (page - 1) * limit;

    const query = { createdBy: id };

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .select('jobNumber customerName pickupAddress dropAddress scheduledDate bookingStatus status driverAssignments totalEstimatedPrice createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Job.countDocuments(query),
    ]);

    sendResponse(
      res,
      200,
      {
        jobs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      'Admin jobs retrieved.'
    );
  } catch (error) {
    next(error);
  }
};
