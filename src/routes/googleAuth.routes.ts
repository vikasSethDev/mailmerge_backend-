import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.util';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import { googleAuthService, GMAIL_READONLY_SCOPE } from '../services/googleAuth.service';
import { gmailProvider } from '../providers/gmail.provider';
import { env } from '../config/env';

const router = Router();

router.get('/google', (_req, res) => {
  res.redirect(302, googleAuthService.getAuthorizationUrl());
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code || !state) {
    res.redirect(`${env.frontendUrl}/login?error=google_authorization_cancelled`);
    return;
  }

  try {
    const result = await googleAuthService.handleCallback(code, state);
    res.redirect(`${env.frontendUrl}/login#access_token=${encodeURIComponent(result.token)}&email=${encodeURIComponent(result.account.email)}&connected=1`);
  } catch (err: any) {
    const message = err?.message ?? 'Google authorization failed';
    res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(message)}`);
  }
}));

router.use(requireAuth);

router.get('/gmail/status', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const email = req.user?.email ?? '';
  const account = await googleAuthService.getConnectedAccount(email);
  res.json({
    success: true,
    data: account
      ? { connected: true, email: account.email, displayName: account.displayName, picture: account.picture, connectedAt: account.connectedAt, readAccess: account.scopes?.includes(GMAIL_READONLY_SCOPE) ?? false }
      : { connected: false, readAccess: false },
  });
}));



router.get('/gmail/messages', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const ownerEmail = req.user?.email ?? '';
  const label = String(req.query.label ?? 'INBOX').toUpperCase();
  if (label !== 'INBOX' && label !== 'SENT') {
    res.status(400).json({ success: false, message: 'label must be INBOX or SENT' });
    return;
  }
  const pageToken = req.query.pageToken ? String(req.query.pageToken) : undefined;
  const query = req.query.q ? String(req.query.q) : undefined;
  const maxResults = Number(req.query.maxResults ?? 25);
  const data = await gmailProvider.listMessages({
    ownerEmail,
    label: label as 'INBOX' | 'SENT',
    pageToken,
    query,
    maxResults: Number.isFinite(maxResults) ? maxResults : 25,
  });
  res.json({ success: true, data });
}));

router.get('/gmail/messages/:messageId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const ownerEmail = req.user?.email ?? '';
  const data = await gmailProvider.getMessage(ownerEmail, req.params.messageId);
  res.json({ success: true, data });
}));

router.post('/gmail/disconnect', asyncHandler(async (req: AuthenticatedRequest, res) => {
  await googleAuthService.disconnect(req.user?.email ?? '');
  res.json({ success: true, data: { connected: false } });
}));

export default router;
