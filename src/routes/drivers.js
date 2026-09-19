import { Router } from 'express';
import {
  addDriver,
  getDrivers,
  getDriver,
  updateDriver,
  deleteDriver,
  getDriverPerformance,
  getDriverWorkHistory,
  uploadDriverDocuments,
  deleteDriverDocument,
  updateDriverVerification,
} from '../controllers/driverController.js';
import {
  registerDriverFcmToken,
  removeDriverFcmToken,
} from '../controllers/driverNotificationController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

router.post('/fcm-token', authorize('driver'), registerDriverFcmToken);
router.delete('/fcm-token', authorize('driver'), removeDriverFcmToken);

// Admin routes with RBAC permissions
router.post('/', authorize('admin', 'manager'), requirePermission('drivers.create'), addDriver);
router.get('/', requirePermission('drivers.view', 'jobs.assign_driver', 'jobs.view', 'jobs.view_all', 'jobs.view_own'), getDrivers);
router.get('/performance', authorize('admin', 'manager'), requirePermission('drivers.view', 'reports.view'), getDriverPerformance);
router.get('/:id/work-history', requirePermission('drivers.view_work_history', 'drivers.view'), getDriverWorkHistory);
router.post('/:id/documents', requirePermission('drivers.edit'), upload.array('documents', 10), uploadDriverDocuments);
router.delete('/:id/documents/:docIndex', requirePermission('drivers.edit'), deleteDriverDocument);
router.put('/:id/verification', requirePermission('drivers.edit'), updateDriverVerification);
router.get('/:id', requirePermission('drivers.view', 'jobs.assign_driver'), getDriver);
router.put('/:id', authorize('admin', 'manager'), requirePermission('drivers.edit'), updateDriver);
router.delete('/:id', authorize('admin', 'manager'), requirePermission('drivers.edit'), deleteDriver);

export default router;
