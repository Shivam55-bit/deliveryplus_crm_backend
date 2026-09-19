import Job from '../models/Job.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { sendResponse } from '../utils/response.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const confirmedFilter = {
      $and: [
        { bookingStatus: { $ne: 'quotation' } },
        {
          $or: [
            { bookingStatus: 'confirmed' },
            { $and: [{ quotationSent: { $ne: true } }, { bookingStatus: { $exists: false } }] },
            { $and: [{ quotationSent: { $ne: true } }, { bookingStatus: null }] },
          ],
        },
      ],
    };

    const [jobStatsResult, activeDrivers, revenueResult, confirmedJobsCount] = await Promise.all([
      Job.aggregate([
        { $match: confirmedFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments({ role: 'driver', isActive: true }),
      Invoice.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Job.countDocuments(confirmedFilter),
    ]);

    const statusCounts = {};
    let totalJobs = confirmedJobsCount || 0;
    for (const item of jobStatsResult) {
      statusCounts[item._id] = (statusCounts[item._id] || 0) + item.count;
    }

    const pendingJobs = statusCounts.pending || 0;
    const assignedJobs = statusCounts.assigned || 0;
    const inTransitJobs = (statusCounts.in_transit || 0) + (statusCounts.inTransit || 0);
    const startedJobs = (statusCounts.started || 0) + (statusCounts.inProgress || 0) + (statusCounts.in_progress || 0) + (statusCounts.progress || 0) + (statusCounts.arrived || 0) + (statusCounts.paused || 0);
    const completedJobs = statusCounts.completed || 0;
    const cancelledJobs = statusCounts.cancelled || 0;
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

export const getReportsStats = async (req, res, next) => {
  try {
    const [jobAggregation, invoiceAggregation] = await Promise.all([
      Job.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
          },
        },
      ]),
    ]);

    const jobCounts = {};
    let totalJobs = 0;
    for (const item of jobAggregation) {
      jobCounts[item._id] = (jobCounts[item._id] || 0) + item.count;
      totalJobs += item.count;
    }

    const completedJobs = jobCounts.completed || 0;
    const cancelledJobs = jobCounts.cancelled || 0;
    const pendingJobs = totalJobs - completedJobs - cancelledJobs;

    const invoiceCounts = {};
    let totalInvoices = 0;
    let paidRevenue = 0;
    for (const item of invoiceAggregation) {
      invoiceCounts[item._id] = item.count;
      totalInvoices += item.count;
      if (item._id === 'paid') {
        paidRevenue = item.totalAmount || 0;
      }
    }

    const paidInvoices = invoiceCounts.paid || 0;
    const overdueInvoices = invoiceCounts.overdue || 0;

    sendResponse(res, 200, {
      report: {
        totalJobs,
        totalInvoices,
        completedJobs,
        cancelledJobs,
        pendingJobs,
        paidInvoices,
        overdueInvoices,
        totalRevenue: paidRevenue,
      },
    }, 'Reports stats retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

