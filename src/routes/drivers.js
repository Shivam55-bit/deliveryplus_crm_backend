import { Router } from 'express';
import {
  addDriver,
  getDrivers,
  getDriver,
  updateDriver,
  deleteDriver,
  getDriverPerformance,
} from '../controllers/driverController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Admin routes
router.post('/', authorize('admin'), addDriver);
router.get('/', getDrivers);
router.get('/performance', authorize('admin'), getDriverPerformance);
router.get('/:id', getDriver);
router.put('/:id', authorize('admin'), updateDriver);
router.delete('/:id', authorize('admin'), deleteDriver);

export default router;
