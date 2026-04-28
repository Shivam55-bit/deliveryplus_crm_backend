import { Router } from 'express';
import { generateInvoice, getInvoice, getInvoices, updateInvoiceStatus, downloadInvoicePDF } from '../controllers/invoiceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin'), getInvoices);
router.get('/:id', getInvoice);
router.get('/:id/download', downloadInvoicePDF);
router.post('/generate/:jobId', authorize('admin'), generateInvoice);
router.put('/:id/status', authorize('admin'), updateInvoiceStatus);

export default router;
