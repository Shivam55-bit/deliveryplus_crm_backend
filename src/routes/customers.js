import { Router } from 'express';
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customerController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('customers.view', 'jobs.create', 'quotations.create', 'jobs.view'), getCustomers);
router.get('/:id', requirePermission('customers.view', 'jobs.view'), getCustomer);
router.post('/', authorize('admin', 'manager'), requirePermission('customers.create'), createCustomer);
router.put('/:id', authorize('admin', 'manager'), requirePermission('customers.edit'), updateCustomer);
router.delete('/:id', authorize('admin', 'manager'), requirePermission('customers.delete'), deleteCustomer);

export default router;
