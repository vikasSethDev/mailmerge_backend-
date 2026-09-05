import { CampaignModel } from '../models/Campaign.model';
import { campaignControlService } from './campaignControl.service';
import { logger } from '../config/logger';

const POLL_INTERVAL_MS = 30_000;

/**
 * Lightweight in-process poller for "Schedule Send". No cron/Redis/BullMQ
 * involved — every POLL_INTERVAL_MS it looks for campaigns whose
 * `scheduledAt` has arrived and starts them via the same campaignControlService
 * used by the manual "Send Now" action.
 *
 * Durability: because the due-time lives on the Campaign document in MongoDB
 * (not in-memory), a server restart never loses a scheduled send — the next
 * poll tick after boot picks up anything that's now due, and campaignRunnerService's
 * own resumeInFlightCampaigns() covers anything that was already running.
 */
class SchedulerService {
  private timer?: NodeJS.Timeout;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error('Scheduler tick failed: %o', err));
    }, POLL_INTERVAL_MS);
    // Also run once immediately on boot so overdue sends don't wait a full interval.
    this.tick().catch((err) => logger.error('Scheduler initial tick failed: %o', err));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    const due = await CampaignModel.find({
      status: 'scheduled',
      scheduledAt: { $lte: new Date() },
    }).select('_id name');

    for (const campaign of due) {
      try {
        await campaignControlService.start(String(campaign._id));
        logger.info('Scheduler: auto-started campaign %s ("%s")', campaign._id, campaign.name);
      } catch (err) {
        logger.error('Scheduler: failed to auto-start campaign %s: %o', campaign._id, err);
      }
    }
  }
}

export const schedulerService = new SchedulerService();