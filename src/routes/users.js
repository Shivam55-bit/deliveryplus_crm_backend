import { Router } from 'express';
import { getUsers, getDrivers, updateUser, updateDriverProfile, createDriver, deleteDriverAccount } from '../controllers/userController.js';
import {
  getDriverWorkHistory,
  uploadDriverDocuments,
  deleteDriverDocument,
  updateDriverVerification,
} from '../controllers/driverController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin', 'superAdmin'), getUsers);
router.get('/drivers', getDrivers);
router.get('/drivers/:id/work-history', requirePermission('drivers.view_work_history', 'drivers.view'), getDriverWorkHistory);
router.post('/drivers/:id/documents', requirePermission('drivers.edit'), upload.array('documents', 10), uploadDriverDocuments);
router.delete('/drivers/:id/documents/:docIndex', requirePermission('drivers.edit'), deleteDriverDocument);
router.put('/drivers/:id/verification', requirePermission('drivers.edit'), updateDriverVerification);
router.post('/drivers', authorize('admin', 'superAdmin'), createDriver);
router.put('/:id', authorize('admin', 'superAdmin', 'manager'), updateUser);
router.put('/drivers/:id', authorize('admin', 'superAdmin'), updateDriverProfile);
router.delete('/drivers/:id', authorize('admin', 'superAdmin'), deleteDriverAccount);

export default router;
