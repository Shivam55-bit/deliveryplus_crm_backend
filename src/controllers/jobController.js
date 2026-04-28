import Job from '../models/Job.js';
import Driver from '../models/Driver.js';
import Notification from '../models/Notification.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';
import { calculateBilling, calculateWorkedTime } from '../utils/billing.js';

export const createJob = async (req, res, next) => {
  try {
    const job = await Job.create(req.body);
    job.timeline.push({ action: 'Job Created', performedBy: req.user._id });
    await job.save();
    sendResponse(res, 201, { job }, 'Job created.');
  } catch (error) {
    next(error);
  }
};

export const getJobs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, jobType, search, startDate, endDate, sort = '-createdAt' } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (jobType) filter.jobType = jobType;
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { jobNumber: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      filter.scheduledDate = {};
      if (startDate) filter.scheduledDate.$gte = new Date(startDate);
      if (endDate) filter.scheduledDate.$lte = new Date(endDate);
    }

    const total = await Job.countDocuments(filter);
    const jobs = await Job.find(filter)
      .populate('assignedDrivers', 'name email phone')
      .populate('assignedVehicle', 'name type registration')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort(sort);

    sendResponse(res, 200, { jobs, pagination: buildPaginationMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('assignedDrivers', 'name email phone')
      .populate('assignedVehicle', 'name type registration')
      .populate('customerId', 'name email phone address')
      .populate('timeline.performedBy', 'name role')
      .populate('invoiceId');

    if (!job) return sendError(res, 404, 'Job not found.');
    sendResponse(res, 200, { job });
  } catch (error) {
    next(error);
  }
};

export const updateJob = async (req, res, next) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!job) return sendError(res, 404, 'Job not found.');
    sendResponse(res, 200, { job }, 'Job updated.');
  } catch (error) {
    next(error);
  }
};

export const assignDrivers = async (req, res, next) => {
  try {
    const { driverIds, vehicleId } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');

    job.assignedDrivers = driverIds;
    if (vehicleId) job.assignedVehicle = vehicleId;
    job.status = 'assigned';
    job.timeline.push({
      action: 'Drivers Assigned',
      performedBy: req.user._id,
      notes: `Assigned ${driverIds.length} driver(s)`,
    });
    await job.save();

    // Update driver availability
    await Driver.updateMany(
      { userId: { $in: driverIds } },
      { availability: 'busy' }
    );

    // Create notifications for assigned drivers
    const notifications = driverIds.map(driverId => ({
      userId: driverId,
      title: 'New Job Assigned',
      message: `You have been assigned to job ${job.jobNumber}`,
      type: 'assignment',
      relatedEntity: 'job',
      relatedId: job._id,
    }));
    await Notification.insertMany(notifications);

    const populated = await Job.findById(job._id)
      .populate('assignedDrivers', 'name email phone')
      .populate('assignedVehicle', 'name type registration');

    sendResponse(res, 200, { job: populated }, 'Drivers assigned successfully.');
  } catch (error) {
    next(error);
  }
};

export const cancelJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');

    job.status = 'cancelled';
    job.timeline.push({ action: 'Job Cancelled', performedBy: req.user._id, notes: req.body.reason });
    await job.save();

    // Free up drivers
    if (job.assignedDrivers.length > 0) {
      await Driver.updateMany(
        { userId: { $in: job.assignedDrivers } },
        { availability: 'available' }
      );
    }

    sendResponse(res, 200, { job }, 'Job cancelled.');
  } catch (error) {
    next(error);
  }
};

// Driver workflow endpoints
export const acceptJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'assigned') return sendError(res, 400, 'Job cannot be accepted in current status.');

    job.timeline.push({ action: 'Job Accepted', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Job accepted.');
  } catch (error) {
    next(error);
  }
};

export const startTransit = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'assigned') return sendError(res, 400, 'Job must be assigned before starting transit.');

    job.status = 'in_transit';
    job.timeline.push({ action: 'Transit Started', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Transit started.');
  } catch (error) {
    next(error);
  }
};

export const arrivedAtLocation = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'in_transit') return sendError(res, 400, 'Must be in transit to mark arrival.');

    job.timeline.push({ action: 'Arrived at Location', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Arrived at location.');
  } catch (error) {
    next(error);
  }
};

export const startJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!['in_transit', 'assigned'].includes(job.status)) {
      return sendError(res, 400, 'Job cannot be started in current status.');
    }

    const { signature, termsAccepted } = req.body;
    job.status = 'started';
    job.timerStarted = new Date();
    if (signature) job.startSignature = signature;
    if (termsAccepted) job.termsAccepted = true;
    job.timeline.push({ action: 'Job Started - Timer Running', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Job started. Timer running.');
  } catch (error) {
    next(error);
  }
};

export const pauseJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'started') return sendError(res, 400, 'Job must be started to pause.');

    job.status = 'paused';
    job.pauseIntervals.push({ pausedAt: new Date() });
    job.timeline.push({ action: 'Job Paused', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Job paused.');
  } catch (error) {
    next(error);
  }
};

export const resumeJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'paused') return sendError(res, 400, 'Job must be paused to resume.');

    job.status = 'started';
    const lastPause = job.pauseIntervals[job.pauseIntervals.length - 1];
    if (lastPause && !lastPause.resumedAt) {
      lastPause.resumedAt = new Date();
    }
    job.timeline.push({ action: 'Job Resumed', performedBy: req.user._id });
    await job.save();

    sendResponse(res, 200, { job }, 'Job resumed.');
  } catch (error) {
    next(error);
  }
};

export const completeJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');
    if (!['started', 'paused'].includes(job.status)) {
      return sendError(res, 400, 'Job must be started or paused to complete.');
    }

    const { signature, completionNotes, damageReport } = req.body;
    job.status = 'completed';
    job.timerEnded = new Date();

    // Close any open pause interval
    const lastPause = job.pauseIntervals[job.pauseIntervals.length - 1];
    if (lastPause && !lastPause.resumedAt) {
      lastPause.resumedAt = new Date();
    }

    // Calculate worked time
    const { totalMinutes, billableHours } = calculateWorkedTime(
      job.timerStarted,
      job.timerEnded,
      job.pauseIntervals
    );
    job.totalWorkedMinutes = totalMinutes;
    job.billableHours = billableHours;

    if (signature) job.endSignature = signature;
    if (completionNotes) job.completionNotes = completionNotes;
    if (damageReport) job.damageReport = damageReport;

    // Auto-calculate billing
    const billing = calculateBilling(job);
    job.billing = { ...job.billing, ...billing };

    job.timeline.push({
      action: 'Job Completed',
      performedBy: req.user._id,
      notes: `Worked ${billableHours}h`,
    });
    await job.save();

    // Free up drivers
    await Driver.updateMany(
      { userId: { $in: job.assignedDrivers } },
      { $inc: { completedJobs: 1 }, availability: 'available' }
    );

    sendResponse(res, 200, { job }, 'Job completed.');
  } catch (error) {
    next(error);
  }
};

export const uploadJobPhotos = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return sendError(res, 404, 'Job not found.');

    if (req.files && req.files.length > 0) {
      const photoPaths = req.files.map(f => `/uploads/${f.filename}`);
      job.photos.push(...photoPaths);
      await job.save();
    }

    sendResponse(res, 200, { job }, 'Photos uploaded.');
  } catch (error) {
    next(error);
  }
};

// Driver's own jobs
export const getDriverJobs = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { assignedDrivers: req.user._id };
    if (status) filter.status = status;

    const jobs = await Job.find(filter)
      .populate('assignedVehicle', 'name type registration')
      .sort({ scheduledDate: 1 });

    sendResponse(res, 200, { jobs });
  } catch (error) {
    next(error);
  }
};

export const getDriverTodayJobs = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const jobs = await Job.find({
      assignedDrivers: req.user._id,
      scheduledDate: { $gte: today, $lt: tomorrow },
    })
      .populate('assignedVehicle', 'name type registration')
      .sort({ scheduledDate: 1 });

    sendResponse(res, 200, { jobs });
  } catch (error) {
    next(error);
  }
};
