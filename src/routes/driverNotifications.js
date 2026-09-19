import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getDriverNotifications,
  markDriverNotificationAsRead,
  markAllDriverNotificationsAsRead,
  getDriverNotificationUnreadCount,
} from '../controllers/driverNotificationController.js';

const router = Router();

router.use(authenticate);
router.get('/notifications', authorize('driver'), getDriverNotifications);
router.get('/notifications/unread-count', authorize('driver'), getDriverNotificationUnreadCount);
router.patch('/notifications/:notificationId/read', authorize('driver'), markDriverNotificationAsRead);
router.patch('/notifications/read-all', authorize('driver'), markAllDriverNotificationsAsRead);

export default router;
