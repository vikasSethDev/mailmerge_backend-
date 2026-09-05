import { Router } from 'express';
import { campaignsController } from '../controllers/campaigns.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/campaigns', campaignsController.list);
router.get('/campaigns/:campaignId', campaignsController.getOne);
router.delete('/campaigns/:campaignId', campaignsController.remove);

router.post('/:campaignId/retry-failed', campaignsController.retryFailed);
router.post('/:campaignId/schedule', campaignsController.schedule);
router.post('/:campaignId/unschedule', campaignsController.unschedule);

export default router;