import { Router } from 'express';
import { templatesController } from '../controllers/templates.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/templates', templatesController.list);
router.post('/templates', templatesController.create);
router.get('/templates/:templateId', templatesController.getOne);
router.put('/templates/:templateId', templatesController.update);
router.post('/templates/:templateId/duplicate', templatesController.duplicate);
router.delete('/templates/:templateId', templatesController.remove);

export default router;