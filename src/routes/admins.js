import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import {
  listAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  updateAdminStatus,
  updateAdminPermissions,
  resetAdminPassword,
  getAdminActivity,
  getAdminJobs,
} from '../controllers/adminManagementController.js';

const router = express.Router();

// All admin management routes require Super Admin privileges
router.use(authenticate, requireSuperAdmin);

router.get('/', listAdmins);
router.post('/', createAdmin);
router.get('/:id', getAdmin);
router.put('/:id', updateAdmin);
router.patch('/:id/status', updateAdminStatus);
router.put('/:id/permissions', updateAdminPermissions);
router.post('/:id/reset-password', resetAdminPassword);
router.get('/:id/activity', getAdminActivity);
router.get('/:id/jobs', getAdminJobs);

export default router;
