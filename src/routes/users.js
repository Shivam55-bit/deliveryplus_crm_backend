import { Router } from 'express';
import { getUsers, getDrivers, updateUser, updateDriverProfile, createDriver } from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin'), getUsers);
router.get('/drivers', getDrivers);
router.post('/drivers', authorize('admin'), createDriver);
router.put('/:id', authorize('admin', 'manager'), updateUser);
router.put('/drivers/:id', authorize('admin'), updateDriverProfile);

export default router;
