import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  getMe,
  registerAdmin,
  registerDriver,
  loginAdmin,
  loginDriver,
} from '../controllers/authController.js';
import { loginValidator, registerValidator } from '../validators/auth.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', registerValidator, validate, register);
router.post('/register/admin', registerValidator, validate, registerAdmin);
router.post('/register/driver', registerValidator, validate, registerDriver);
router.post('/login', loginValidator, validate, login);
router.post('/login/admin', loginValidator, validate, loginAdmin);
router.post('/login/driver', loginValidator, validate, loginDriver);
router.post('/refresh-token', refreshToken);
router.get('/me', authenticate, getMe);

export default router;
