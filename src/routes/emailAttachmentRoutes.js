import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadEmailAttachment } from '../middleware/uploadEmailAttachment.js';
import {
  listEmailAttachments,
  createEmailAttachment,
  getEmailAttachment,
  downloadEmailAttachment,
  updateEmailAttachment,
  deleteEmailAttachment,
} from '../controllers/emailAttachmentController.js';

const router = Router();

router.use(authenticate);
router.get('/', listEmailAttachments);
router.post('/', authorize('admin'), uploadEmailAttachment.array('files', 20), createEmailAttachment);
router.get('/:id', authorize('admin'), getEmailAttachment);
router.get('/:id/download', authorize('admin'), downloadEmailAttachment);
router.patch('/:id', authorize('admin'), updateEmailAttachment);
router.delete('/:id', authorize('admin'), deleteEmailAttachment);

export default router;
