import { Router } from 'express';
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customerController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.post('/', authorize('admin'), createCustomer);
router.put('/:id', authorize('admin'), updateCustomer);
router.delete('/:id', authorize('admin'), deleteCustomer);

export default router;
