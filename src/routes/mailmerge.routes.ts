import { Router } from 'express';
import { mailMergeController } from '../controllers/mailmerge.controller';
import { uploadCsv, uploadAttachment } from '../middleware/upload.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';

const router = Router();

// Public: unsubscribe links are clicked from plain email clients, no auth token available.
router.get('/unsubscribe', mailMergeController.unsubscribe);

// Public: open-pixel and click-redirect links are loaded directly by the recipient's mail
// client/browser, which never carries our JWT — these must stay outside requireAuth.
router.get('/track/open/:emailJobId', mailMergeController.trackOpen);
router.get('/track/click/:emailJobId', mailMergeController.trackClick);

// Dev-only: mints a short-lived JWT so the standalone demo frontend can call the
// authenticated routes below without a real login screen. Your host app should
// replace this with its own session/JWT (see frontend INTEGRATION.md, step 5) —
// this route refuses to run once NODE_ENV=production.
router.post('/dev-token', (req, res) => {
  if (env.nodeEnv === 'production') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }
  const token = jwt.sign(
    { id: 'dev-user', email: 'dev@local.test', role: 'admin' },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn } as jwt.SignOptions,
  );
  res.json({ success: true, token });
});

// Everything else requires an authenticated user.
router.use(requireAuth);

router.post('/import-csv', uploadRateLimiter, uploadCsv.single('file'), mailMergeController.importCsv);
router.get('/import-batch/:importBatchId/contacts', mailMergeController.listContacts);
router.post('/import-batch/:importBatchId/remove-invalid', mailMergeController.removeInvalidContacts);
router.delete('/contacts/:contactId', mailMergeController.removeContact);

router.post('/upload-attachment', uploadRateLimiter, uploadAttachment.single('file'), mailMergeController.uploadAttachment);
router.delete('/attachments/:attachmentId', mailMergeController.removeAttachment);

router.post('/preview', mailMergeController.preview);
router.post('/send-test', mailMergeController.sendTest);
router.post('/validate', mailMergeController.validate);

router.get('/dashboard/summary', mailMergeController.dashboardSummary);
router.get('/dashboard/timeseries', mailMergeController.dashboardTimeseries);

router.post('/create-campaign', mailMergeController.createCampaign);
router.post('/:campaignId/start', mailMergeController.start);
router.post('/:campaignId/pause', mailMergeController.pause);
router.post('/:campaignId/resume', mailMergeController.resume);
router.post('/:campaignId/cancel', mailMergeController.cancel);
router.get('/:campaignId/status', mailMergeController.status);
router.get('/:campaignId/logs', mailMergeController.logs);

export default router;
