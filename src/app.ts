import express, { Express } from 'express';
import path from 'path';

import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/env';

import { apiRateLimiter } from './middleware/rateLimiter.middleware';

import { notFoundHandler, errorHandler } from './middleware/error.middleware';

import mailMergeRoutes from './routes/mailmerge.routes';
import campaignsRoutes from './routes/campaigns.routes';
import templatesRoutes from './routes/templates.routes';
import contactsRoutes from './routes/contacts.routes';
import emailHistoryRoutes from './routes/emailHistory.routes';
import googleAuthRoutes from './routes/googleAuth.routes';

export function createApp(): Express {
  const app = express();

  // =========================
  // SECURITY
  // =========================

  app.use(helmet());

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );

  // =========================
  // BODY PARSING
  // =========================

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // =========================
  // RATE LIMITER
  // =========================

  app.use(apiRateLimiter);

  // =========================
  // API ROUTES
  // =========================

  app.use('/api/auth', googleAuthRoutes);

  app.get('/health', (_req, res) =>
    res.json({
      success: true,
      status: 'ok',
      env: env.nodeEnv,
    }),
  );

  app.use('/api/mailmerge', mailMergeRoutes);
  app.use('/api/mailmerge', campaignsRoutes);
  app.use('/api/mailmerge', templatesRoutes);
  app.use('/api/mailmerge', contactsRoutes);
  app.use('/api/mailmerge', emailHistoryRoutes);

  // =========================
  // ANGULAR FRONTEND
  // =========================

  const publicPath = path.join(process.cwd(), 'public');

  // Serve Angular build files from /public
  app.use(express.static(publicPath));

  // Angular SPA fallback
  // Do not return index.html for API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // =========================
  // ERROR HANDLERS
  // =========================

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}