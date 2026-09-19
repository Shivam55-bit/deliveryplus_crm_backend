import mongoose from 'mongoose';
import Job from '../models/Job.js';
import { isSuperAdmin } from '../middleware/auth.js';

/**
 * Builds a comprehensive MongoDB query object for Jobs based on input filter parameters and user RBAC permissions.
 */
export const buildJobFilterQuery = (params = {}, reqUser = null) => {
  const conditions = [];

  // 1. Booking Status Filter
  const normalizedBookingStatus = String(params.bookingStatus || '').trim().toLowerCase();
  if (normalizedBookingStatus === 'quotation') {
    conditions.push({ bookingStatus: 'quotation' });
  } else if (normalizedBookingStatus === 'all') {
    // No bookingStatus constraint
  } else {
    // Default to confirmed operational jobs
    conditions.push({ bookingStatus: 'confirmed' });
  }

  // 2. Quotation Status Filter
  if (params.quotationStatus) {
    conditions.push({ 'quotation.status': params.quotationStatus });
  }

  // 3. Job Status Filter
  if (params.status) {
    if (Array.isArray(params.status)) {
      conditions.push({ status: { $in: params.status } });
    } else if (params.status.includes(',')) {
      const statuses = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      conditions.push({ status: { $in: statuses } });
    } else {
      conditions.push({ status: params.status });
    }
  }

  // 4. Job Type Filter
  if (params.jobType) {
    conditions.push({ jobType: params.jobType });
  }

  // 5. Job Code / Job Number Filter
  if (params.jobNumber || params.jobCode) {
    const code = String(params.jobNumber || params.jobCode).trim();
    conditions.push({ jobNumber: { $regex: code, $options: 'i' } });
  }

  // 6. Customer Name Filter
  if (params.customerName) {
    conditions.push({ customerName: { $regex: String(params.customerName).trim(), $options: 'i' } });
  }

  // 7. Customer Phone Filter
  if (params.customerPhone) {
    conditions.push({ customerPhone: { $regex: String(params.customerPhone).trim(), $options: 'i' } });
  }

  // 8. General Search (Customer Name, Phone, Email, Job Number, Locations)
  if (params.search) {
    const searchRegex = { $regex: String(params.search).trim(), $options: 'i' };
    conditions.push({
      $or: [
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { customerEmail: searchRegex },
        { jobNumber: searchRegex },
        { pickupAddress: searchRegex },
        { pickupSuburb: searchRegex },
        { dropAddress: searchRegex },
        { dropoffAddress: searchRegex },
        { dropSuburb: searchRegex },
      ],
    });
  }

  // 9. Location Filters
  if (params.pickup || params.pickupAddress) {
    const pLoc = String(params.pickup || params.pickupAddress).trim();
    conditions.push({
      $or: [
        { pickupAddress: { $regex: pLoc, $options: 'i' } },
        { pickupSuburb: { $regex: pLoc, $options: 'i' } },
        { pickupState: { $regex: pLoc, $options: 'i' } },
      ],
    });
  }

  if (params.drop || params.dropAddress || params.dropoffAddress) {
    const dLoc = String(params.drop || params.dropAddress || params.dropoffAddress).trim();
    conditions.push({
      $or: [
        { dropAddress: { $regex: dLoc, $options: 'i' } },
        { dropoffAddress: { $regex: dLoc, $options: 'i' } },
        { dropSuburb: { $regex: dLoc, $options: 'i' } },
        { dropState: { $regex: dLoc, $options: 'i' } },
      ],
    });
  }

  // 10. Scheduled Date Range Filter
  const dateFromValue = params.dateFrom || params.startDate;
  const dateToValue = params.dateTo || params.endDate;
  if (dateFromValue || dateToValue) {
    const dateFilter = {};
    if (dateFromValue) {
      const dFrom = new Date(dateFromValue);
      dFrom.setHours(0, 0, 0, 0);
      dateFilter.$gte = dFrom;
    }
    if (dateToValue) {
      const dTo = new Date(dateToValue);
      dTo.setHours(23, 59, 59, 999);
      dateFilter.$lte = dTo;
    }
    conditions.push({ scheduledDate: dateFilter });
  }

  // 11. Assigned Driver Filter (Querying both driverAssignments.driverId and assignedDrivers)
  if (params.driverId || params.driver) {
    const rawDriverId = String(params.driverId || params.driver).trim();
    if (mongoose.Types.ObjectId.isValid(rawDriverId)) {
      const driverObjId = new mongoose.Types.ObjectId(rawDriverId);
      conditions.push({
        $or: [
          { 'driverAssignments.driverId': driverObjId },
          { assignedDrivers: driverObjId },
        ],
      });
    } else {
      // If name or alias provided, search populated driver or assignments
      conditions.push({
        $or: [
          { driverName: { $regex: rawDriverId, $options: 'i' } },
          { 'driverAssignments.driverName': { $regex: rawDriverId, $options: 'i' } },
        ],
      });
    }
  }

  // 12. Driver Role Filter
  if (params.driverRole) {
    conditions.push({ 'driverAssignments.role': params.driverRole });
  }

  // 13. Driver Session Start / End Date Range
  if (params.driverDateFrom || params.driverDateTo) {
    const sessionDateFilter = {};
    if (params.driverDateFrom) sessionDateFilter.$gte = new Date(params.driverDateFrom);
    if (params.driverDateTo) sessionDateFilter.$lte = new Date(params.driverDateTo);
    conditions.push({
      $or: [
        { 'driverAssignments.startedAt': sessionDateFilter },
        { 'driverAssignments.completedAt': sessionDateFilter },
        { startedAt: sessionDateFilter },
        { completedAt: sessionDateFilter },
      ],
    });
  }

  // 14. Created By Admin Filter
  if (params.createdBy) {
    const creator = String(params.createdBy).trim();
    if (creator === 'super_admin' || creator === 'superAdmin') {
      conditions.push({ createdByRole: { $in: ['super_admin', 'superAdmin'] } });
    } else if (creator === 'admin') {
      conditions.push({ createdByRole: 'admin' });
    } else if (mongoose.Types.ObjectId.isValid(creator)) {
      conditions.push({ createdBy: new mongoose.Types.ObjectId(creator) });
    } else {
      conditions.push({ createdByName: { $regex: creator, $options: 'i' } });
    }
  }

  // 15. Pricing Type Filter
  if (params.pricingType) {
    conditions.push({ pricingType: params.pricingType });
  }

  // 16. Amount Range Filter
  if (params.minAmount !== undefined && params.minAmount !== '' && params.minAmount !== null) {
    const minAmt = Number(params.minAmount);
    if (Number.isFinite(minAmt)) {
      conditions.push({
        $or: [
          { 'billing.totalAmount': { $gte: minAmt } },
          { finalTotal: { $gte: minAmt } },
          { minimumEstimatedCost: { $gte: minAmt } },
          { fixedPrice: { $gte: minAmt } },
          { fixedQuote: { $gte: minAmt } },
        ],
      });
    }
  }

  if (params.maxAmount !== undefined && params.maxAmount !== '' && params.maxAmount !== null) {
    const maxAmt = Number(params.maxAmount);
    if (Number.isFinite(maxAmt)) {
      conditions.push({
        $or: [
          { 'billing.totalAmount': { $lte: maxAmt } },
          { finalTotal: { $lte: maxAmt } },
          { minimumEstimatedCost: { $lte: maxAmt } },
          { fixedPrice: { $lte: maxAmt } },
          { fixedQuote: { $lte: maxAmt } },
        ],
      });
    }
  }

  // 17. Worked Minutes Range Filter
  if (params.minWorkedMinutes !== undefined && params.minWorkedMinutes !== '' && params.minWorkedMinutes !== null) {
    const minMins = Number(params.minWorkedMinutes);
    if (Number.isFinite(minMins)) {
      conditions.push({
        $or: [
          { 'driverAssignments.totalWorkedMinutes': { $gte: minMins } },
          { totalWorkedMinutes: { $gte: minMins } },
        ],
      });
    }
  }

  if (params.maxWorkedMinutes !== undefined && params.maxWorkedMinutes !== '' && params.maxWorkedMinutes !== null) {
    const maxMins = Number(params.maxWorkedMinutes);
    if (Number.isFinite(maxMins)) {
      conditions.push({
        $or: [
          { 'driverAssignments.totalWorkedMinutes': { $lte: maxMins } },
          { totalWorkedMinutes: { $lte: maxMins } },
        ],
      });
    }
  }

  // 18. Role-based visibility policy (RBAC enforcement for Admin / Manager)
  if (reqUser && !isSuperAdmin(reqUser)) {
    const userRole = String(reqUser.role || '').toLowerCase();
    if (userRole === 'admin' || userRole === 'manager') {
      const userPerms = Array.isArray(reqUser.permissions) ? reqUser.permissions : [];
      const canViewAll = userPerms.includes('*') || userPerms.includes('all') || userPerms.includes('jobs.view_all') || userPerms.includes('jobs.view');
      const canViewOwn = userPerms.includes('jobs.view_own');
      if (!canViewAll && canViewOwn) {
        conditions.push({ createdBy: reqUser._id });
      }
    } else if (userRole === 'driver') {
      const driverId = reqUser._id;
      conditions.push({
        $or: [
          { 'driverAssignments.driverId': driverId },
          { assignedDrivers: driverId },
        ],
      });
    }
  }

  return conditions.length > 0 ? { $and: conditions } : {};
};

/**
 * Calculates aggregate summary metrics for the current filtered job set.
 * When driverId is provided, calculates driver-specific duration and earnings.
 */
export const calculateJobSummaryStats = async (filterQuery = {}, driverId = null, reqUser = null) => {
  const jobs = await Job.find(filterQuery)
    .populate('driverAssignments.driverId', 'name email')
    .lean();

  let completedJobs = 0;
  let inProgressJobs = 0;
  let pendingJobs = 0;
  let cancelledJobs = 0;
  let totalWorkedMinutes = 0;
  let totalCustomerRevenue = 0;
  let totalDriverEarnings = 0;

  const targetDriverStr = driverId ? String(driverId).trim() : null;

  for (const job of jobs) {
    const status = String(job.status || '').toLowerCase();
    if (status === 'completed') completedJobs++;
    else if (['in_progress', 'in_transit', 'started'].includes(status)) inProgressJobs++;
    else if (status === 'pending' || status === 'assigned') pendingJobs++;
    else if (status === 'cancelled') cancelledJobs++;

    // Customer Revenue
    const customerAmount = Number(
      job.billing?.totalAmount ?? job.finalTotal ?? job.pricingSnapshot?.finalTotal ?? job.minimumEstimatedCost ?? job.fixedPrice ?? job.fixedQuote ?? 0
    );
    if (Number.isFinite(customerAmount) && customerAmount > 0) {
      totalCustomerRevenue += customerAmount;
    }

    // Driver Duration & Earnings
    if (targetDriverStr) {
      // Driver-specific calculation
      const assignment = (job.driverAssignments || []).find((a) => {
        const aId = String(a.driverId?._id || a.driverId || '');
        return aId === targetDriverStr;
      });

      if (assignment) {
        const mins = Number(assignment.totalWorkedMinutes || 0);
        totalWorkedMinutes += Math.max(0, mins);

        const driverAmt = Number(assignment.pricingSnapshot?.finalDriverAmount ?? 0);
        if (Number.isFinite(driverAmt) && driverAmt > 0) {
          totalDriverEarnings += driverAmt;
        }
      } else if (job.assignedDrivers?.some((d) => String(d._id || d) === targetDriverStr)) {
        // Legacy fallback
        const legacyMins = Number(job.totalWorkedMinutes || 0);
        totalWorkedMinutes += Math.max(0, legacyMins);
      }
    } else {
      // Team / overall calculation
      let teamJobMins = 0;
      if (Array.isArray(job.driverAssignments) && job.driverAssignments.length > 0) {
        for (const a of job.driverAssignments) {
          const aMins = Number(a.totalWorkedMinutes || 0);
          teamJobMins += Math.max(0, aMins);
          const aAmt = Number(a.pricingSnapshot?.finalDriverAmount ?? 0);
          if (Number.isFinite(aAmt) && aAmt > 0) {
            totalDriverEarnings += aAmt;
          }
        }
      } else {
        teamJobMins = Number(job.totalWorkedMinutes || 0);
      }
      totalWorkedMinutes += teamJobMins;
    }
  }

  const totalWorkedHours = Number((totalWorkedMinutes / 60).toFixed(2));

  return {
    totalJobs: jobs.length,
    completedJobs,
    inProgressJobs,
    pendingJobs,
    cancelledJobs,
    totalWorkedMinutes,
    totalWorkedHours,
    totalCustomerRevenue: Math.round((totalCustomerRevenue + Number.EPSILON) * 100) / 100,
    totalDriverEarnings: Math.round((totalDriverEarnings + Number.EPSILON) * 100) / 100,
  };
};
