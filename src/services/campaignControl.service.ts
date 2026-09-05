import { CampaignModel, ICampaign } from '../models/Campaign.model';
import { EmailJobModel } from '../models/EmailJob.model';
import { templateService } from './template.service';
import { previewService } from './preview.service';
import { campaignService } from './campaign.service';
import { campaignRunnerService } from './campaignRunner.service';
import { ApiError } from '../utils/asyncHandler.util';
import { logger } from '../config/logger';
import { Types } from 'mongoose';
import { injectTracking } from '../utils/trackingLink.util';
import { env } from '../config/env';

class CampaignControlService {
  /** Builds one EmailJob per sendable contact, then starts the in-process send loop. */
  async start(campaignId: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);

    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      throw new ApiError(409, `Campaign cannot be started from status "${campaign.status}"`);
    }

    const template = await templateService.getById(String(campaign.templateId));
    if (!template) throw new ApiError(404, 'Email template not found for this campaign');

    const contacts = await campaignService.getSendableContactsForCampaign(campaign);

    let queuedCount = 0;

    for (const contact of contacts) {
      // Avoid duplicating jobs if start() is called again after a partial run.
      const existing = await EmailJobModel.findOne({ campaignId: campaign._id, contactId: contact._id });
      if (existing && ['sent', 'queued', 'sending', 'retrying'].includes(existing.status)) {
        continue;
      }

      const rendered = previewService.render(
        {
          fromName: template.fromName,
          fromEmail: template.fromEmail,
          toTemplate: template.toTemplate,
          ccTemplate: template.ccTemplate,
          bccTemplate: template.bccTemplate,
          subjectTemplate: template.subjectTemplate,
          bodyHtmlTemplate: template.bodyHtmlTemplate,
        },
        contact,
      );

      const attachments = await previewService.resolveAttachments(contact, {
        attachmentMode: campaign.attachmentMode,
        sameAttachmentIds: campaign.sameAttachmentIds.map(String),
        attachmentCsvColumn: campaign.attachmentCsvColumn,
      });

      const resolvedAttachments = attachments
        .filter((a) => a.resolved && a.path)
        .map((a) => ({ fileName: a.fileName, path: a.path as string, attachmentId: a.attachmentId }));

      if (existing) {
        existing.status = 'queued';
        existing.errorMessage = undefined;
        existing.personalizedBody = injectTracking(rendered.html, env.appBaseUrl, String(existing._id));
        await existing.save();
      } else {
        const jobId = new Types.ObjectId();
        await EmailJobModel.create({
          _id: jobId,
          campaignId: campaign._id,
          contactId: contact._id,
          recipient: rendered.to,
          cc: rendered.cc,
          bcc: rendered.bcc,
          fromName: template.fromName,
          fromEmail: template.fromEmail,
          subject: rendered.subject,
          personalizedBody: injectTracking(rendered.html, env.appBaseUrl, String(jobId)),
          attachments: resolvedAttachments,
          status: 'queued',
          attempts: 0,
          maxAttempts: 5,
        });
      }

      queuedCount += 1;
    }

    campaign.status = 'running';
    campaign.startedAt = campaign.startedAt ?? new Date();
    campaign.stats.queued = queuedCount;
    await campaign.save();

    // Kick off (or resume) the in-process send loop for this campaign.
    // No Redis/queue involved — it walks EmailJob documents directly in MongoDB.
    campaignRunnerService.start(String(campaign._id));

    logger.info('Campaign %s started with %d jobs queued', campaignId, queuedCount);
    return campaign;
  }

  /** Marks the campaign paused. The runner loop checks this flag before every send. */
  async pause(campaignId: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);
    if (campaign.status !== 'running') {
      throw new ApiError(409, `Campaign cannot be paused from status "${campaign.status}"`);
    }
    campaign.status = 'paused';
    campaign.pausedAt = new Date();
    await campaign.save();
    return campaign;
  }

  async resume(campaignId: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);
    if (campaign.status !== 'paused') {
      throw new ApiError(409, `Campaign cannot be resumed from status "${campaign.status}"`);
    }
    campaign.status = 'running';
    campaign.pausedAt = undefined;
    await campaign.save();

    // The loop may have exited (e.g. after a server restart) — start() is a
    // safe no-op if it's already running.
    campaignRunnerService.start(campaignId);

    return campaign;
  }

  async cancel(campaignId: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);
    if (!['running', 'paused', 'queued', 'draft', 'scheduled'].includes(campaign.status)) {
      throw new ApiError(409, `Campaign cannot be cancelled from status "${campaign.status}"`);
    }

    const result = await EmailJobModel.updateMany(
      { campaignId, status: { $in: ['queued', 'retrying'] } },
      { status: 'cancelled', errorMessage: 'Campaign cancelled by user' },
    );

    campaign.status = 'cancelled';
    campaign.stats.cancelled += result.modifiedCount ?? 0;
    await campaign.save();
    // If a runner loop is still active for this campaign, it will notice the
    // "cancelled" status on its next iteration and stop itself.

    return campaign;
  }

  /**
   * Requeues only the EmailJob documents currently in "failed" status for this
   * campaign, resetting their attempt counter. Successful ("sent") recipients
   * are never touched, so re-running this is always safe.
   */
  async retryFailed(campaignId: string): Promise<{ campaign: ICampaign; retriedCount: number }> {
    const campaign = await campaignService.getById(campaignId);

    const failedJobs = await EmailJobModel.find({ campaignId, status: 'failed' });
    if (failedJobs.length === 0) {
      return { campaign, retriedCount: 0 };
    }

    await EmailJobModel.updateMany(
      { campaignId, status: 'failed' },
      { $set: { status: 'queued', attempts: 0, errorMessage: undefined, bounced: false } },
    );

    campaign.stats.failed = Math.max(0, campaign.stats.failed - failedJobs.length);
    campaign.stats.queued += failedJobs.length;
    if (!['running', 'paused'].includes(campaign.status)) {
      campaign.status = 'running';
    }
    await campaign.save();

    campaignRunnerService.start(String(campaign._id));

    logger.info('Campaign %s: retrying %d failed job(s)', campaignId, failedJobs.length);
    return { campaign, retriedCount: failedJobs.length };
  }

  /** Schedules a draft campaign to auto-start at a future time. See scheduler.service.ts for the poller. */
  async schedule(campaignId: string, scheduledAt: Date, timezone?: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      throw new ApiError(409, `Campaign cannot be scheduled from status "${campaign.status}"`);
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new ApiError(400, 'scheduledAt must be in the future');
    }

    campaign.status = 'scheduled';
    campaign.sendMode = 'scheduled';
    campaign.scheduledAt = scheduledAt;
    campaign.timezone = timezone;
    await campaign.save();
    return campaign;
  }

  /** Reverts a scheduled campaign back to draft, clearing its scheduled time. */
  async unschedule(campaignId: string): Promise<ICampaign> {
    const campaign = await campaignService.getById(campaignId);
    if (campaign.status !== 'scheduled') {
      throw new ApiError(409, `Campaign cannot be unscheduled from status "${campaign.status}"`);
    }
    campaign.status = 'draft';
    campaign.sendMode = 'draft';
    campaign.scheduledAt = undefined;
    await campaign.save();
    return campaign;
  }

  async getStatus(campaignId: string) {
    const campaign = await campaignService.getById(campaignId);

    const [sent, queued, failed, retrying, cancelled, skipped, sending] = await Promise.all([
      EmailJobModel.countDocuments({ campaignId, status: 'sent' }),
      EmailJobModel.countDocuments({ campaignId, status: 'queued' }),
      EmailJobModel.countDocuments({ campaignId, status: 'failed' }),
      EmailJobModel.countDocuments({ campaignId, status: 'retrying' }),
      EmailJobModel.countDocuments({ campaignId, status: 'cancelled' }),
      EmailJobModel.countDocuments({ campaignId, status: 'skipped' }),
      EmailJobModel.countDocuments({ campaignId, status: 'sending' }),
    ]);

    const totalJobs = sent + queued + failed + retrying + cancelled + skipped + sending;
    const remaining = queued + retrying + sending;
    const progressPct = totalJobs === 0 ? 0 : Math.round((sent / totalJobs) * 100);

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      progressPct,
      sent,
      queued,
      sending,
      failed,
      retrying,
      cancelled,
      skipped,
      remaining,
      totalJobs,
      startedAt: campaign.startedAt,
      pausedAt: campaign.pausedAt,
      completedAt: campaign.completedAt,
    };
  }
}

export const campaignControlService = new CampaignControlService();