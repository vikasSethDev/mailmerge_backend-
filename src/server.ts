import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';
import { campaignRunnerService } from './services/campaignRunner.service';
import { schedulerService } from './services/scheduler.service';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  // Emails are sent directly from this process (Gmail API, no Redis/queue).
  // If the server restarted while a campaign was mid-flight, its EmailJob
  // documents are still safely sitting in MongoDB — just restart the loop.
  await campaignRunnerService.resumeInFlightCampaigns();

  // Polls for "Schedule Send" campaigns whose scheduled time has arrived.
  schedulerService.start();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Mail merge API listening on port ${env.port} (${env.nodeEnv})`);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down HTTP server...');
    server.close(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});