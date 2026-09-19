import { Router } from 'express';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '../controllers/vehicleController.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('vehicles.view', 'jobs.assign_driver', 'jobs.view', 'jobs.create'), getVehicles);
router.post('/', authorize('admin', 'manager'), requirePermission('vehicles.create'), createVehicle);
router.put('/:id', authorize('admin', 'manager'), requirePermission('vehicles.edit'), updateVehicle);
router.delete('/:id', authorize('admin', 'manager'), requirePermission('vehicles.delete'), deleteVehicle);

export default router;
