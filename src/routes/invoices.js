import { Router } from 'express';
import {
  createInvoice,
  generateInvoice,
  getInvoice,
  getInvoices,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  downloadInvoicePDF,
} from '../controllers/invoiceController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('admin', 'manager'), requirePermission('invoices.view'), getInvoices);
router.get('/:id', requirePermission('invoices.view', 'jobs.view', 'jobs.view_all', 'jobs.view_own'), getInvoice);
router.get('/:id/download', requirePermission('invoices.view', 'jobs.view'), downloadInvoicePDF);
router.post('/', authorize('admin', 'manager'), requirePermission('invoices.generate'), createInvoice);
router.post('/generate/:jobId', authorize('admin', 'manager'), requirePermission('invoices.generate'), generateInvoice);
router.put('/:id', authorize('admin', 'manager'), requirePermission('invoices.generate', 'invoices.record_payment'), updateInvoice);
router.put('/:id/status', authorize('admin', 'manager'), requirePermission('invoices.record_payment'), updateInvoiceStatus);
router.delete('/:id', authorize('admin', 'manager'), requirePermission('invoices.generate'), deleteInvoice);

export default router;
