import { Router } from 'express';
import { emailHistoryController } from '../controllers/emailHistory.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/email-history/summary', emailHistoryController.summary);
router.get('/email-history/:emailJobId', emailHistoryController.getOne);
router.get('/email-history', emailHistoryController.list);

export default router;
