import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  registerDeviceToken,
  unregisterDeviceToken,
  unregisterAllDeviceTokens,
  getDeviceTokenStatus,
} from '../controllers/deviceTokenController.js';

const router = Router();

router.use(authenticate);
router.post('/register', authorize('driver'), registerDeviceToken);
router.post('/unregister', authorize('driver'), unregisterDeviceToken);
router.delete('/all', authorize('driver'), unregisterAllDeviceTokens);
router.get('/status', authorize('driver'), getDeviceTokenStatus);

export default router;
