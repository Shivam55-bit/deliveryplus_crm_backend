import { Router } from 'express';
import { getLeads, createLead, updateLead, deleteLead, getFollowUps, createFollowUp, updateFollowUp } from '../controllers/crmController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, authorize('admin'));

// Leads
router.get('/leads', getLeads);
router.post('/leads', createLead);
router.put('/leads/:id', updateLead);
router.delete('/leads/:id', deleteLead);

// Follow-ups
router.get('/follow-ups', getFollowUps);
router.post('/follow-ups', createFollowUp);
router.put('/follow-ups/:id', updateFollowUp);

export default router;
