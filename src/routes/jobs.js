import { Router } from 'express';
import {
  createJob, getJobs, getJob, updateJob, assignDrivers, cancelJob,
  acceptJob, startTransit, arrivedAtLocation, startJob, pauseJob, resumeJob, completeJob,
  uploadJobPhotos, getDriverJobs, getDriverTodayJobs,
} from '../controllers/jobController.js';
import { createJobValidator, assignDriverValidator } from '../validators/job.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

// Admin job management
router.post('/', authorize('admin'), createJobValidator, validate, createJob);
router.get('/', getJobs);
router.get('/driver/my-jobs', authorize('driver'), getDriverJobs);
router.get('/driver/today', authorize('driver'), getDriverTodayJobs);
router.get('/:id', getJob);
router.put('/:id', authorize('admin'), updateJob);
router.post('/:id/assign', authorize('admin'), assignDriverValidator, validate, assignDrivers);
router.post('/:id/cancel', authorize('admin'), cancelJob);

// Driver workflow
router.post('/:id/accept', authorize('driver'), acceptJob);
router.post('/:id/start-transit', authorize('driver'), startTransit);
router.post('/:id/arrived', authorize('driver'), arrivedAtLocation);
router.post('/:id/start', authorize('driver'), startJob);
router.post('/:id/pause', authorize('driver'), pauseJob);
router.post('/:id/resume', authorize('driver'), resumeJob);
router.post('/:id/complete', authorize('driver'), completeJob);
router.post('/:id/photos', authorize('driver'), upload.array('photos', 10), uploadJobPhotos);

export default router;
