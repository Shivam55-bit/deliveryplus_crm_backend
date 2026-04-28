import { Router } from 'express';
import { getUsers, getDrivers, updateUser, updateDriverProfile } from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin'), getUsers);
router.get('/drivers', getDrivers);
router.put('/:id', authorize('admin', 'manager'), updateUser);
router.put('/drivers/:id', authorize('admin'), updateDriverProfile);

export default router;
