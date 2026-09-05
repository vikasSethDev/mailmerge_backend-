import { Types, FilterQuery } from 'mongoose';
import { EmailJobModel, IEmailJob, EmailJobStatus } from '../models/EmailJob.model';
import { CampaignModel } from '../models/Campaign.model';
import { ContactModel } from '../models/Contact.model';
import { ApiError } from '../utils/asyncHandler.util';

export interface ListEmailHistoryQuery {
  search?: string;
  status?: EmailJobStatus;
  campaignId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface EmailHistoryRow {
  _id: string;
  campaignId: string;
  campaignName: string;
  recipient: string;
  subject: string;
  status: EmailJobStatus;
  attempts: number;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
  openedAt?: Date;
  openCount: number;
  clickedAt?: Date;
  clickCount: number;
}

export interface ListEmailHistoryResult {
  rows: EmailHistoryRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Powers the "Send Emails" history page — a read-only, cross-campaign view over
 * the same EmailJob records the per-campaign Logs tab and Dashboard already use.
 * No sending/queueing/retry logic lives here; this only ever reads.
 */
class EmailHistoryService {
  /** Search + filter + paginate every email ever sent, newest first, with the campaign name joined in. */
  async list(query: ListEmailHistoryQuery): Promise<ListEmailHistoryResult> {
    const filter: FilterQuery<IEmailJob> = {};

    if (query.status) filter.status = query.status;

    if (query.campaignId) {
      if (!Types.ObjectId.isValid(query.campaignId)) throw new ApiError(400, 'Invalid campaignId');
      filter.campaignId = query.campaignId;
    }

    if (query.search && query.search.trim().length > 0) {
      const re = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
      filter.$or = [{ recipient: re }, { subject: re }];
    }

    const dateRange: Record<string, Date> = {};
    if (query.from) dateRange.$gte = query.from;
    if (query.to) dateRange.$lte = query.to;
    if (Object.keys(dateRange).length) filter.createdAt = dateRange;

    const page = Math.max(1, query.page);
    const limit = Math.min(Math.max(1, query.limit), 100);

    const [jobs, total] = await Promise.all([
      EmailJobModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          'campaignId recipient subject status attempts errorMessage sentAt createdAt openedAt openCount clickedAt clickCount',
        )
        .lean(),
      EmailJobModel.countDocuments(filter),
    ]);

    const campaignIds = [...new Set(jobs.map((j) => String(j.campaignId)))];
    const campaigns = campaignIds.length
      ? await CampaignModel.find({ _id: { $in: campaignIds } }).select('name').lean()
      : [];
    const nameById = new Map(campaigns.map((c) => [String(c._id), c.name]));

    const rows: EmailHistoryRow[] = jobs.map((j) => ({
      _id: String(j._id),
      campaignId: String(j.campaignId),
      campaignName: nameById.get(String(j.campaignId)) ?? 'Unknown campaign',
      recipient: j.recipient,
      subject: j.subject,
      status: j.status,
      attempts: j.attempts,
      errorMessage: j.errorMessage,
      sentAt: j.sentAt,
      createdAt: j.createdAt as unknown as Date,
      openedAt: j.openedAt,
      openCount: j.openCount,
      clickedAt: j.clickedAt,
      clickCount: j.clickCount,
    }));

    return { rows, total, page, limit };
  }

  /** Full detail for a single sent email — complete content, recipient and delivery info. */
  async getById(emailJobId: string) {
    if (!Types.ObjectId.isValid(emailJobId)) throw new ApiError(400, 'Invalid email id');

    const job = await EmailJobModel.findById(emailJobId).lean();
    if (!job) throw new ApiError(404, 'Email not found');

    const [campaign, contact] = await Promise.all([
      CampaignModel.findById(job.campaignId).select('name status').lean(),
      ContactModel.findById(job.contactId).select('email fields unsubscribed').lean(),
    ]);

    return {
      job,
      campaignName: campaign?.name ?? 'Unknown campaign',
      campaignStatus: campaign?.status,
      contact: contact ? { email: contact.email, fields: contact.fields, unsubscribed: contact.unsubscribed } : null,
    };
  }
}

export const emailHistoryService = new EmailHistoryService();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
