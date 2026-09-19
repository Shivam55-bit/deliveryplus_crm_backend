import { Router } from 'express';
import { getDashboardStats, getDailyJobsChart, getDriverPerformance, getReportsStats } from '../controllers/dashboardController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, authorize('admin', 'manager'));

router.get('/stats', requirePermission('dashboard.view', 'jobs.view', 'reports.view'), getDashboardStats);
router.get('/daily-jobs', requirePermission('dashboard.view', 'jobs.view', 'reports.view'), getDailyJobsChart);
router.get('/driver-performance', requirePermission('dashboard.view', 'drivers.view', 'reports.view'), getDriverPerformance);
router.get('/reports', requirePermission('reports.view', 'dashboard.view'), getReportsStats);

export default router;

