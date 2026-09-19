import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Job from '../models/Job.js';
import { sendResponse, sendError } from '../utils/response.js';
import { normalizeJobForResponse } from './jobController.js';
import { finalizeDriverSessionPricing, createDriverStartPricingSnapshot, deriveLegacyDriverPricing } from '../services/driverPricingService.js';

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
      .select('-fcmTokens userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive createdAt updatedAt')
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
      .select('-fcmTokens userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive createdAt updatedAt')
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
    const driver = await Driver.findOne({
      $or: [{ _id: req.params.id }, { userId: req.params.id }],
    })
      .select('-fcmTokens')
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
    const { licenseNumber, vehicleNumber, vehicleTypes, availability, verificationStatus, documents } = req.body;
    const updateData = {};
    if (licenseNumber !== undefined) updateData.licenseNumber = licenseNumber;
    if (vehicleNumber !== undefined) updateData.vehicleNumber = vehicleNumber;
    if (vehicleTypes !== undefined) updateData.vehicleTypes = vehicleTypes;
    if (availability !== undefined) updateData.availability = availability;
    if (verificationStatus !== undefined) updateData.verificationStatus = verificationStatus;
    if (documents !== undefined) updateData.documents = documents;

    const driver = await Driver.findOneAndUpdate(
      { $or: [{ _id: req.params.id }, { userId: req.params.id }] },
      updateData,
      { new: true, runValidators: true }
    )
      .select('-fcmTokens userId licenseNumber vehicleNumber vehicleTypes availability currentLocation rating totalJobs completedJobs isActive verificationStatus documents createdAt updatedAt')
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
    const driver = await Driver.findOne({
      $or: [{ _id: req.params.id }, { userId: req.params.id }],
    });
    if (!driver) {
      return sendError(res, 404, 'Driver not found.');
    }

    if (driver.isDeleted || driver.isActive === false) {
      return sendResponse(res, 200, {
        driver,
        deletedDriverId: driver._id,
      }, 'Driver already deleted.');
    }

    driver.isDeleted = true;
    driver.isActive = false;
    driver.deletedAt = new Date();
    driver.deletedBy = req.user?._id;
    await driver.save();

    if (driver.userId) {
      await User.findByIdAndUpdate(driver.userId, { isActive: false });
    }

    sendResponse(res, 200, {
      driver,
      deletedDriverId: driver._id,
    }, 'Driver deleted successfully.');
  } catch (error) {
    next(error);
  }
};

// Get driver performance
export const getDriverPerformance = async (req, res, next) => {
  try {
    const drivers = await Driver.find()
      .populate('userId', 'name email')
      .select('-fcmTokens userId totalJobs completedJobs rating');

    sendResponse(res, 200, { drivers });
  } catch (error) {
    next(error);
  }
};

// Get driver work session history with job details
export const getDriverWorkHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Search by Driver._id or Driver.userId or User._id
    let driver = await Driver.findById(id)
      .select('-fcmTokens')
      .populate('userId', 'name email phone role avatar');

    if (!driver) {
      driver = await Driver.findOne({ userId: id })
        .select('-fcmTokens')
        .populate('userId', 'name email phone role avatar');
    }

    let targetUserId = driver?.userId?._id || driver?.userId || id;
    let targetUserName = driver?.userId?.name || 'Driver';
    let targetDriverId = driver?._id;

    if (!driver) {
      const user = await User.findById(id).select('name email phone role avatar');
      if (user) {
        targetUserId = user._id;
        targetUserName = user.name;
        driver = await Driver.findOne({ userId: user._id })
          .select('-fcmTokens')
          .populate('userId', 'name email phone role avatar');
        if (driver) {
          targetDriverId = driver._id;
        }
      } else {
        return sendError(res, 404, 'Driver not found.');
      }
    }

    const { dateFrom, dateTo, status } = req.query;
    const candidateIds = [targetUserId, targetDriverId, id].filter(Boolean);
    const candidateIdStrs = candidateIds.map(String);

    const jobQuery = {
      $or: [
        { 'driverAssignments.driverId': { $in: candidateIds } },
        { assignedDrivers: { $in: candidateIds } },
      ],
    };

    if (dateFrom || dateTo) {
      const dateCond = {};
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        dateCond.$gte = start;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateCond.$lte = end;
      }
      jobQuery.$and = [
        {
          $or: [
            { scheduledDate: dateCond },
            { completedAt: dateCond },
            { startedAt: dateCond },
            { createdAt: dateCond },
          ],
        },
      ];
    }

    // Query all jobs where driver is in driverAssignments or assignedDrivers
    const rawJobs = await Job.find(jobQuery)
      .populate('assignedDrivers', 'name email phone')
      .populate('driverAssignments.driverId', 'name email phone')
      .populate('driverAssignments.assignedBy', 'name role')
      .populate('assignedVehicle', 'name type registration')
      .populate('customerId', 'name email phone address')
      .sort({ createdAt: -1 })
      .lean();

    const isRequestingDriver = req.user?.role === 'driver';

    const history = rawJobs.map((job) => {
      const normalized = normalizeJobForResponse(job, {
        forDriver: isRequestingDriver,
        driverId: String(targetUserId),
      });
      
      const assignment = (job.driverAssignments || []).find(
        (a) => {
          const aId = String(a.driverId?._id || a.driverId || '');
          return candidateIdStrs.includes(aId);
        }
      ) || null;

      const isLegacy = !assignment && (job.assignedDrivers || []).some(d => candidateIdStrs.includes(String(d._id || d)));

      const sessionAssignedAt = assignment?.assignedAt || job.assignedAt || job.createdAt;
      const sessionStartedAt = assignment?.startedAt || (isLegacy && (job.status === 'started' || job.status === 'completed') ? job.startedAt : null);
      const sessionCompletedAt = assignment?.completedAt || (isLegacy && job.status === 'completed' ? job.completedAt : null);
      const sessionStatus = assignment?.status || (job.status === 'completed' ? 'completed' : (job.status === 'started' || job.status === 'in_transit') ? 'in_progress' : 'assigned');
      
      let sessionWorkedMinutes = assignment?.totalWorkedMinutes ?? 0;
      if (!sessionWorkedMinutes && sessionStartedAt && sessionCompletedAt) {
        sessionWorkedMinutes = Math.max(0, Math.floor((new Date(sessionCompletedAt).getTime() - new Date(sessionStartedAt).getTime()) / 60000));
      } else if (!sessionWorkedMinutes && sessionStartedAt && sessionStatus === 'in_progress') {
        sessionWorkedMinutes = Math.max(0, Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 60000));
      }

      const sessionWorkedHours = Number((sessionWorkedMinutes / 60).toFixed(2));

      // Resolve authoritative pricing snapshot for this driver session
      let pricingSnapshot = assignment?.pricingSnapshot || null;
      if (!pricingSnapshot) {
        if (isLegacy) {
          pricingSnapshot = deriveLegacyDriverPricing(job, sessionWorkedMinutes);
        } else if (sessionStatus === 'completed') {
          pricingSnapshot = finalizeDriverSessionPricing(
            { ...assignment, startedAt: sessionStartedAt, completedAt: sessionCompletedAt, totalWorkedMinutes: sessionWorkedMinutes },
            job,
            sessionCompletedAt
          );
        } else if (sessionStatus === 'in_progress' || sessionStartedAt) {
          pricingSnapshot = createDriverStartPricingSnapshot(job);
        }
      }

      // Role-based pricing visibility masking
      const showPriceToDriver = Boolean(job.showDriverPrice);
      if (isRequestingDriver && !showPriceToDriver) {
        pricingSnapshot = null;
      }

      const finalDriverAmount = pricingSnapshot && sessionStatus === 'completed'
        ? Number(pricingSnapshot.finalDriverAmount ?? 0)
        : null;

      // Match start agreement strictly to this driver
      let driverAgreement = assignment?.startAgreement || null;
      if (!driverAgreement && job.startAgreement && candidateIdStrs.includes(String(job.startAgreement?.driverId?._id || job.startAgreement?.driverId))) {
        driverAgreement = job.startAgreement;
      }

      let roleLabel = 'Driver';
      if (assignment?.role) {
        roleLabel = assignment.role === 'primary' ? 'Lead Driver' : assignment.role === 'helper' ? 'Helper' : 'Driver';
      } else if (isLegacy) {
        roleLabel = 'Driver (Legacy)';
      }

      return {
        jobId: String(job._id),
        jobCode: job.jobNumber || job.jobCode || `JOB-${String(job._id).slice(-4).toUpperCase()}`,
        pickupAddress: job.pickupAddress || job.pickUpAddress || '',
        dropAddress: job.dropAddress || job.dropoffAddress || job.deliveryAddress || '',
        jobStatus: job.status,
        sessionStatus,
        role: roleLabel,
        assignedAt: sessionAssignedAt,
        startedAt: sessionStartedAt,
        completedAt: sessionCompletedAt,
        totalWorkedMinutes: sessionWorkedMinutes,
        totalWorkedHours: sessionWorkedHours,
        pricingSnapshot,
        finalDriverAmount,
        showDriverPrice: showPriceToDriver,
        startAgreement: driverAgreement,
        assignedVehicle: job.assignedVehicle ? `${job.assignedVehicle.name}${job.assignedVehicle.registration ? ` (${job.assignedVehicle.registration})` : ''}` : null,
        scheduledDate: job.scheduledDate || null,
        scheduledTime: job.scheduledTime || (job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime} - ${job.scheduledEndTime}` : null),
        createdAt: job.createdAt,
        isLegacy,
      };
    });

    const completedSessions = history.filter((h) => h.sessionStatus === 'completed');
    const inProgressSessions = history.filter((h) => h.sessionStatus === 'in_progress');
    const assignedSessions = history.filter((h) => h.sessionStatus === 'assigned');

    const totalWorkedMinutes = completedSessions.reduce((sum, h) => sum + (h.totalWorkedMinutes || 0), 0);
    const totalWorkedHours = Number((totalWorkedMinutes / 60).toFixed(2));
    const averageSessionMinutes = completedSessions.length > 0 ? Math.round(totalWorkedMinutes / completedSessions.length) : 0;
    const averageSessionHours = Number((averageSessionMinutes / 60).toFixed(2));

    const totalEarnings = completedSessions.reduce((sum, h) => {
      if (h.finalDriverAmount !== null && h.finalDriverAmount !== undefined) {
        return sum + Number(h.finalDriverAmount);
      }
      return sum;
    }, 0);

    const summary = {
      totalJobs: history.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      assignedSessions: assignedSessions.length,
      totalWorkedMinutes,
      totalWorkedHours,
      averageSessionMinutes,
      averageSessionHours,
      totalEarnings: Math.round((totalEarnings + Number.EPSILON) * 100) / 100,
    };

    sendResponse(res, 200, {
      driver: driver || { userId: targetUserId, name: targetUserName },
      summary,
      history,
    });
  } catch (error) {
    next(error);
  }
};

// Upload documents for a driver
export const uploadDriverDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, status } = req.body;

    let driver = await Driver.findOne({
      $or: [{ _id: id }, { userId: id }],
    });

    if (!driver) {
      const user = await User.findById(id);
      if (user && user.role === 'driver') {
        driver = await Driver.create({
          userId: user._id,
          verificationStatus: 'pending',
          documents: [],
        });
      } else {
        return sendError(res, 404, 'Driver not found.');
      }
    }

    const newDocs = [];

    if (req.file) {
      newDocs.push({
        type: type || 'driver_license',
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        status: status || 'verified',
        uploadedAt: new Date(),
      });
    }

    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const f of req.files) {
        newDocs.push({
          type: type || 'document',
          name: f.originalname,
          url: `/uploads/${f.filename}`,
          status: status || 'verified',
          uploadedAt: new Date(),
        });
      }
    }

    if (req.body.url) {
      newDocs.push({
        type: type || 'document',
        name: req.body.name || 'Uploaded Document',
        url: req.body.url,
        status: status || 'verified',
        uploadedAt: new Date(),
      });
    }

    if (Array.isArray(req.body.documents)) {
      for (const d of req.body.documents) {
        if (d.url) {
          newDocs.push({
            type: d.type || 'document',
            name: d.name || 'Document',
            url: d.url,
            status: d.status || 'verified',
            uploadedAt: d.uploadedAt || new Date(),
          });
        }
      }
    }

    if (newDocs.length > 0) {
      driver.documents.push(...newDocs);
      driver.verificationStatus = 'verified';
      await driver.save();
    }

    const populated = await Driver.findById(driver._id).populate('userId', 'name email phone avatar');
    sendResponse(res, 200, { driver: populated, documents: driver.documents }, 'Driver documents uploaded successfully.');
  } catch (error) {
    next(error);
  }
};

// Delete driver document
export const deleteDriverDocument = async (req, res, next) => {
  try {
    const { id, docIndex } = req.params;
    const driver = await Driver.findOne({
      $or: [{ _id: id }, { userId: id }],
    });

    if (!driver) return sendError(res, 404, 'Driver not found.');

    const idx = parseInt(docIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= driver.documents.length) {
      driver.documents = driver.documents.filter(d => String(d._id) !== String(docIndex));
    } else {
      driver.documents.splice(idx, 1);
    }

    if (driver.documents.length === 0) {
      driver.verificationStatus = 'pending';
    }

    await driver.save();
    const populated = await Driver.findById(driver._id).populate('userId', 'name email phone avatar');
    sendResponse(res, 200, { driver: populated, documents: driver.documents }, 'Document deleted successfully.');
  } catch (error) {
    next(error);
  }
};

// Update verification status
export const updateDriverVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { verificationStatus } = req.body;

    if (!['pending', 'verified', 'rejected'].includes(verificationStatus)) {
      return sendError(res, 400, 'Invalid verification status.');
    }

    const driver = await Driver.findOneAndUpdate(
      { $or: [{ _id: id }, { userId: id }] },
      { verificationStatus },
      { new: true }
    ).populate('userId', 'name email phone avatar');

    if (!driver) return sendError(res, 404, 'Driver not found.');
    sendResponse(res, 200, { driver }, 'Driver verification updated.');
  } catch (error) {
    next(error);
  }
};
