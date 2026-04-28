import Job from '../models/Job.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { sendResponse } from '../utils/response.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalJobs,
      pendingJobs,
      assignedJobs,
      inTransitJobs,
      startedJobs,
      completedJobs,
      cancelledJobs,
      activeDrivers,
      revenueResult,
    ] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: 'pending' }),
      Job.countDocuments({ status: 'assigned' }),
      Job.countDocuments({ status: 'in_transit' }),
      Job.countDocuments({ status: 'started' }),
      Job.countDocuments({ status: 'completed' }),
      Job.countDocuments({ status: 'cancelled' }),
      User.countDocuments({ role: 'driver', isActive: true }),
      Invoice.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    sendResponse(res, 200, {
      totalJobs,
      pendingJobs,
      assignedJobs,
      inTransitJobs,
      startedJobs,
      completedJobs,
      cancelledJobs,
      totalRevenue,
      activeDrivers,
    });
  } catch (error) {
    next(error);
  }
};

export const getDailyJobsChart = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const data = await Job.aggregate([
      { $match: { status: 'completed', updatedAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$billing.totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    sendResponse(res, 200, { chartData: data });
  } catch (error) {
    next(error);
  }
};

export const getDriverPerformance = async (req, res, next) => {
  try {
    const drivers = await Driver.find()
      .populate('userId', 'name email')
      .sort({ completedJobs: -1 })
      .limit(10);

    sendResponse(res, 200, { drivers });
  } catch (error) {
    next(error);
  }
};
