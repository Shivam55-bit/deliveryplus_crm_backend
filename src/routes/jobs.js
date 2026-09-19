import { Router } from 'express';
import {
  createJob, getJobs, getJob, updateJob, assignDrivers, cancelJob,
  deleteJob, deleteAllJobs,
  acceptJob, startTransit, arrivedAtLocation, startJob, pauseJob, resumeJob,
  getJobCompletionTerms, getJobCompletionPreview, acceptJobTerms,
  submitEndSignature, completeJob, uploadJobPhotos, getDriverJobs, getDriverTodayJobs,
  completeJobTermsDebug, resendCompletionDocuments, endDriverWorkSession,
  confirmBooking, sendQuotationEmailEndpoint, resendConfirmationEmailEndpoint, getQuotationStats,
  previewJobEmailTemplate, createPublicBooking, getJobsSummary, exportJobsCsv,
  adjustCompletedJob,
} from '../controllers/jobController.js';
import { createJobValidator, assignDriverValidator, completeJobValidator } from '../validators/job.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const normalizeJobAddressAliases = (req, _res, next) => {
  if (!req.body) return next();

  if (req.body.pickUpAddress && !req.body.pickupAddress) {
    req.body.pickupAddress = req.body.pickUpAddress;
  }

  if (req.body.dropoffAddress && !req.body.dropAddress) {
    req.body.dropAddress = req.body.dropoffAddress;
  }

  if (req.body.dropOffAddress && !req.body.dropAddress) {
    req.body.dropAddress = req.body.dropOffAddress;
  }

  if (req.body.deliveryAddress && !req.body.dropAddress) {
    req.body.dropAddress = req.body.deliveryAddress;
  }

  if (req.body.destinationAddress && !req.body.dropAddress) {
    req.body.dropAddress = req.body.destinationAddress;
  }

  if (req.body.originAddress && !req.body.pickupAddress) {
    req.body.pickupAddress = req.body.originAddress;
  }

  next();
};

const router = Router();

// Public booking request (No authentication required)
router.post('/public-booking', normalizeJobAddressAliases, createPublicBooking);

router.use(authenticate);

// Admin job & quotation management with RBAC permission enforcement
router.post('/', authorize('admin', 'manager'), requirePermission('jobs.create', 'quotations.create'), normalizeJobAddressAliases, createJobValidator, validate, createJob);
router.get('/', requirePermission('jobs.view', 'jobs.view_all', 'jobs.view_own', 'quotations.view'), getJobs);
router.get('/summary', requirePermission('jobs.view', 'jobs.view_all', 'jobs.view_own', 'quotations.view'), getJobsSummary);
router.get('/export', requirePermission('jobs.view', 'jobs.view_all', 'jobs.view_own', 'quotations.view', 'reports.view'), exportJobsCsv);
router.delete('/', authorize('admin', 'manager'), requirePermission('jobs.cancel'), deleteAllJobs);
router.get('/quotations/stats', requirePermission('quotations.view', 'jobs.view', 'jobs.view_all', 'jobs.view_own'), getQuotationStats);

router.get('/driver/my-jobs', authorize('driver'), getDriverJobs);
router.get('/driver/today', authorize('driver'), getDriverTodayJobs);
router.get('/completion-terms', authorize('driver'), getJobCompletionTerms);
router.post('/preview-email', authorize('admin', 'manager'), requirePermission('email.send', 'quotations.send'), previewJobEmailTemplate);
router.get('/:id', getJob);
router.delete('/:id', authorize('admin', 'manager'), requirePermission('jobs.cancel'), deleteJob);
router.put('/:id/adjust', authorize('admin', 'manager'), requirePermission('jobs.edit', 'jobs.edit_all', 'jobs.edit_own'), adjustCompletedJob);
router.put('/:id', authorize('admin', 'manager'), requirePermission('jobs.edit', 'jobs.edit_all', 'jobs.edit_own'), normalizeJobAddressAliases, createJobValidator, validate, updateJob);
router.post('/:id/confirm-booking', authorize('admin', 'manager'), requirePermission('jobs.confirm_quotation', 'quotations.confirm'), confirmBooking);
router.post('/:id/send-quotation', authorize('admin', 'manager'), requirePermission('quotations.send', 'email.send'), sendQuotationEmailEndpoint);
router.post('/:id/send-confirmation', authorize('admin', 'manager'), requirePermission('jobs.confirm_quotation', 'email.send'), resendConfirmationEmailEndpoint);
router.post('/:id/assign', authorize('admin', 'manager'), requirePermission('jobs.assign_driver', 'drivers.assign'), assignDriverValidator, validate, assignDrivers);
router.post('/:id/cancel', authorize('admin', 'manager'), requirePermission('jobs.cancel'), cancelJob);
router.post('/:id/completion-documents/resend', authorize('admin', 'manager'), requirePermission('email.send'), resendCompletionDocuments);

// Driver workflow
router.post('/:id/accept', authorize('driver'), acceptJob);
router.post('/:id/start-transit', authorize('driver'), startTransit);
router.post('/:id/arrived', authorize('driver'), arrivedAtLocation);
router.get('/:id/completion-preview', authorize('driver'), getJobCompletionPreview);
router.post('/:id/terms', authorize('driver'), acceptJobTerms);
router.post('/:id/end-signature', authorize('driver'), upload.fields([
  { name: 'endSignature', maxCount: 1 },
  { name: 'customerEndSignature', maxCount: 1 },
  { name: 'customerSignature', maxCount: 1 },
]), submitEndSignature);
router.post('/:id/start', authorize('driver'), startJob);
router.post('/:id/driver-session/end', authorize('driver'), endDriverWorkSession);
router.post('/:id/pause', authorize('driver'), pauseJob);
router.post('/:id/resume', authorize('driver'), resumeJob);
router.post('/:id/complete', authorize('driver'), upload.fields([
  { name: 'endSignature', maxCount: 1 },
  { name: 'customerEndSignature', maxCount: 1 },
  { name: 'customerSignature', maxCount: 1 },
  { name: 'paymentProof', maxCount: 1 },
  { name: 'damagePhotos', maxCount: 10 },
  { name: 'photos', maxCount: 10 },
]), completeJobTermsDebug, completeJobValidator, validate, completeJob);
router.post('/:id/photos', authorize('driver'), upload.array('photos', 10), uploadJobPhotos);

export default router;
