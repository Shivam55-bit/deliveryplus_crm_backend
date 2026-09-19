import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllTemplates,
  getTemplateByKey,
  updateTemplate,
  restoreDefault,
  restoreVersion,
  previewTemplate,
  sendTestEmail,
} from '../controllers/emailTemplateController.js';

const router = Router();

// Protect all email template routes with Admin / Manager authorization
router.use(authenticate);
router.use(authorize('admin', 'manager'));

router.get('/', getAllTemplates);
router.get('/:key', getTemplateByKey);
router.put('/:key', updateTemplate);
router.post('/:key/restore-default', restoreDefault);
router.post('/:key/restore-version/:version', restoreVersion);
router.post('/:key/preview', previewTemplate);
router.post('/:key/test-email', sendTestEmail);

export default router;
