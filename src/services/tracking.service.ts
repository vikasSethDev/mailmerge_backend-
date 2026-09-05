import { Types } from 'mongoose';
import { EmailJobModel, IEmailJob } from '../models/EmailJob.model';
import { EmailEventModel } from '../models/EmailEvent.model';

// A minimal 1x1 transparent GIF, served for every open-tracking hit.
const TRANSPARENT_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
export const TRANSPARENT_GIF_BUFFER = Buffer.from(TRANSPARENT_GIF_BASE64, 'base64');

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

class TrackingService {
  /** Records a pixel-load open event. Safe to call multiple times per recipient (opens are re-counted). */
  async recordOpen(emailJobId: string, meta: RequestMeta): Promise<void> {
    if (!Types.ObjectId.isValid(emailJobId)) return;
    const job = await EmailJobModel.findById(emailJobId);
    if (!job) return;

    await this.bumpJobAndLog(job, 'open', meta);
  }

  /** Records a click event and returns the original URL to redirect to, or null if invalid/missing. */
  async recordClick(emailJobId: string, rawUrl: string | undefined, meta: RequestMeta): Promise<string | null> {
    if (!Types.ObjectId.isValid(emailJobId) || !rawUrl) return null;
    const job = await EmailJobModel.findById(emailJobId);
    if (!job) return null;

    let destination: string;
    try {
      destination = decodeURIComponent(rawUrl);
      // Only ever redirect to http(s) destinations — never let this become an open redirector.
      const parsed = new URL(destination);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    } catch {
      return null;
    }

    await this.bumpJobAndLog(job, 'click', meta, destination);
    return destination;
  }

  private async bumpJobAndLog(
    job: IEmailJob,
    type: 'open' | 'click',
    meta: RequestMeta,
    url?: string,
  ): Promise<void> {
    const now = new Date();
    if (type === 'open') {
      await EmailJobModel.updateOne(
        { _id: job._id },
        { $inc: { openCount: 1 }, $set: { openedAt: job.openedAt ?? now } },
      );
    } else {
      await EmailJobModel.updateOne(
        { _id: job._id },
        { $inc: { clickCount: 1 }, $set: { clickedAt: job.clickedAt ?? now } },
      );
    }

    await EmailEventModel.create({
      campaignId: job.campaignId,
      emailJobId: job._id,
      recipient: job.recipient,
      type,
      url,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
  }
}

export const trackingService = new TrackingService();
