import { Router } from 'express';
import { getDashboardStats, getDailyJobsChart, getDriverPerformance } from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/stats', getDashboardStats);
router.get('/daily-jobs', getDailyJobsChart);
router.get('/driver-performance', getDriverPerformance);

export default router;
