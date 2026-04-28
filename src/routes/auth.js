import { Router } from 'express';
import { register, login, refreshToken, getMe } from '../controllers/authController.js';
import { loginValidator, registerValidator } from '../validators/auth.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', registerValidator, validate, register);
router.post('/login', loginValidator, validate, login);
router.post('/refresh-token', refreshToken);
router.get('/me', authenticate, getMe);

export default router;
