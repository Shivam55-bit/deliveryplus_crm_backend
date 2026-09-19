import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createAdminDriverNotification,
  createTestDriverNotification,
} from '../controllers/driverNotificationController.js';
import {
  getAdminNotifications,
  getAdminNotificationStats,
  sendManualNotification,
  getDriverPushStatus,
  createAdminNotification,
  markAllAdminNotificationsRead,
} from '../controllers/adminNotificationController.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin', 'manager'));

router.get('/notifications', getAdminNotifications);
router.get('/notifications/stats', getAdminNotificationStats);
router.patch('/notifications/read-all', markAllAdminNotificationsRead);
router.post('/notifications/send', sendManualNotification);
router.post('/notifications', createAdminNotification);
router.get('/drivers/:driverId/push-status', getDriverPushStatus);
router.post('/driver-notifications', createAdminDriverNotification);
router.post('/notifications/test', createTestDriverNotification);


export default router;
