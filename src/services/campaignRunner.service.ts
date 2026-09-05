import { CampaignModel, ICampaign } from '../models/Campaign.model';
import { EmailJobModel, IEmailJob } from '../models/EmailJob.model';
import { EmailLogModel } from '../models/EmailLog.model';
import { ContactModel } from '../models/Contact.model';
import { mailSenderService } from './mailSender.service';
import { isRateLimitError, isBounceError } from '../providers/nodemailer.provider';
import { campaignRateLimiter } from './rateLimiter.service';
import { logger } from '../config/logger';

const PAUSE_POLL_MS = 5000; // how often a paused campaign re-checks if it's been resumed
const BETWEEN_SENDS_MS = 250; // small yield between sends so we do not hammer the provider back-to-back
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends campaign emails directly from this Node process — no Redis, no
 * BullMQ, no separate worker process. One async loop per running campaign
 * walks its EmailJob documents in MongoDB, respects the campaign's own
 * send-rate limits, and calls the configured Gmail API provider directly.
 *
 * Durability: because job state lives in MongoDB (not an in-memory queue),
 * restarting the API process never loses a job — see
 * `resumeInFlightCampaigns()`, called on server boot, which restarts the
 * loop for any campaign still marked "running" after a restart.
 *
 * Scaling note: this design assumes a single backend instance is
 * responsible for sending. If you later run multiple API instances behind a
 * load balancer, either designate one instance to run campaigns, or
 * reintroduce a shared queue (BullMQ+Redis, SQS, etc.) at that point.
 */
class CampaignRunnerService {
  private activeCampaigns = new Set<string>();

  /** Starts (or no-ops if already running) the send loop for a campaign. */
  start(campaignId: string): void {
    if (this.activeCampaigns.has(campaignId)) return;
    this.activeCampaigns.add(campaignId);

    this.runLoop(campaignId)
      .catch((err) => logger.error('Campaign runner %s crashed: %o', campaignId, err))
      .finally(() => this.activeCampaigns.delete(campaignId));
  }

  isRunning(campaignId: string): boolean {
    return this.activeCampaigns.has(campaignId);
  }

  private async runLoop(campaignId: string): Promise<void> {
    logger.info('Campaign runner started for %s', campaignId);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) {
        logger.warn('Campaign %s no longer exists, stopping runner', campaignId);
        return;
      }

      if (campaign.status === 'cancelled') {
        await EmailJobModel.updateMany(
          { campaignId, status: { $in: ['queued', 'retrying'] } },
          { status: 'cancelled', errorMessage: 'Campaign cancelled' },
        );
        logger.info('Campaign %s cancelled, stopping runner', campaignId);
        return;
      }

      if (campaign.status === 'paused') {
        await sleep(PAUSE_POLL_MS);
        continue;
      }

      if (campaign.status !== 'running') {
        return; // draft / completed / failed — nothing for this loop to do
      }

      const nextJob = await EmailJobModel.findOne({
        campaignId,
        status: { $in: ['queued', 'retrying'] },
      }).sort({ createdAt: 1 });

      if (!nextJob) {
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        logger.info('Campaign %s completed', campaignId);
        return;
      }

      const rateCheck = campaignRateLimiter.checkAndConsume(campaignId, campaign.rateLimits);
      if (!rateCheck.allowed) {
        logger.warn(
          'Campaign %s hit its own %s send-rate limit — waiting %dms',
          campaignId,
          rateCheck.reason,
          rateCheck.retryAfterMs,
        );
        await sleep(Math.min(rateCheck.retryAfterMs, MAX_BACKOFF_MS));
        continue;
      }

      await this.processJob(campaign, nextJob);
      await sleep(BETWEEN_SENDS_MS);
    }
  }

  private async processJob(campaign: ICampaign, emailJob: IEmailJob): Promise<void> {
    const contact = await ContactModel.findById(emailJob.contactId);

    if (contact?.unsubscribed) {
      emailJob.status = 'unsubscribed';
      await emailJob.save();
      await EmailLogModel.create({
        campaignId: campaign._id,
        emailJobId: emailJob._id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        status: 'unsubscribed',
        attemptNumber: emailJob.attempts,
      });
      return;
    }

    emailJob.status = 'sending';
    emailJob.attempts += 1;
    await emailJob.save();

    try {
      const result = await mailSenderService.sendPersonalized({
        ownerEmail: campaign.createdBy ?? emailJob.fromEmail,
        fromName: emailJob.fromName,
        fromEmail: emailJob.fromEmail,
        to: emailJob.recipient,
        cc: emailJob.cc,
        bcc: emailJob.bcc,
        subject: emailJob.subject,
        html: emailJob.personalizedBody,
        attachments: emailJob.attachments.map((a) => ({ filename: a.fileName, path: a.path })),
      });

      emailJob.status = 'sent';
      emailJob.sentAt = new Date();
      await emailJob.save();

      await CampaignModel.updateOne({ _id: campaign._id }, { $inc: { 'stats.sent': 1 } });

      await EmailLogModel.create({
        campaignId: campaign._id,
        emailJobId: emailJob._id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        status: 'sent',
        attemptNumber: emailJob.attempts,
        providerMessageId: result.messageId,
        sentAt: emailJob.sentAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const bounced = isBounceError(err);
      // A hard bounce (mailbox doesn't exist, domain rejects, etc.) will never
      // succeed on retry — fail it immediately instead of burning attempts.
      const willRetry = !bounced && emailJob.attempts < emailJob.maxAttempts;

      emailJob.status = willRetry ? 'retrying' : 'failed';
      emailJob.errorMessage = message;
      emailJob.bounced = bounced;
      await emailJob.save();

      await EmailLogModel.create({
        campaignId: campaign._id,
        emailJobId: emailJob._id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        status: emailJob.status,
        attemptNumber: emailJob.attempts,
        errorMessage: message,
      });

      if (!willRetry) {
        await CampaignModel.updateOne({ _id: campaign._id }, { $inc: { 'stats.failed': 1 } });
        logger.error(
          'Email job %s permanently failed after %d attempts: %s',
          emailJob._id,
          emailJob.attempts,
          message,
        );
        return;
      }

      await CampaignModel.updateOne({ _id: campaign._id }, { $inc: { 'stats.retrying': 1 } });

      // Exponential-ish backoff before this job is eligible to be picked up again.
      // If the provider itself signaled a rate limit, back off longer regardless.
      const backoffMs = isRateLimitError(err)
        ? MAX_BACKOFF_MS
        : Math.min(1000 * 2 ** emailJob.attempts, MAX_BACKOFF_MS);
      await sleep(backoffMs);
    }
  }

  /** Called on server boot to restart loops for campaigns left "running" after a restart. */
  async resumeInFlightCampaigns(): Promise<void> {
    const running = await CampaignModel.find({ status: 'running' }).select('_id');
    running.forEach((c) => this.start(String(c._id)));
    if (running.length > 0) {
      logger.info('Resumed %d in-flight campaign(s) after startup', running.length);
    }
  }
}

export const campaignRunnerService = new CampaignRunnerService();