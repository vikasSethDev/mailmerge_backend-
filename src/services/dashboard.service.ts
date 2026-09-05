import { EmailJobModel } from '../models/EmailJob.model';
import { EmailLogModel } from '../models/EmailLog.model';
import { EmailEventModel } from '../models/EmailEvent.model';
import { CampaignModel } from '../models/Campaign.model';

export type DashboardGranularity = 'day' | 'month';

export interface DashboardSummary {
  totalSent: number;
  delivered: number;
  failed: number;
  bounced: number;
  pending: number;
  cancelled: number;
  unsubscribed: number;
  totalCampaigns: number;
  activeCampaigns: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
}

export interface TimeSeriesPoint {
  /** 'YYYY-MM-DD' for day granularity, 'YYYY-MM' for month granularity. */
  period: string;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
}

/**
 * Aggregates cross-campaign send activity for the top-level analytics dashboard.
 *
 * Note on "delivered": this module has no provider delivery/bounce webhooks wired
 * up yet (see README §10), so there is no independent delivery signal distinct
 * from a successful SMTP handoff. "delivered" is therefore currently an alias
 * for "sent" (a job whose send attempt succeeded). Once bounce webhooks or
 * open/click tracking are added, wire delivered/bounced through here instead.
 */
class DashboardService {
  async getSummary(from?: Date, to?: Date): Promise<DashboardSummary> {
    // Only "sent" has a precise, immutable timestamp to range-filter on (sentAt).
    // The other counters reflect *current* job state, not state as of a past date
    // (an EmailJob's updatedAt keeps moving as opens/clicks land on it later), so
    // they're reported as running totals regardless of from/to.
    const sentRange: Record<string, Date> = {};
    if (from) sentRange.$gte = from;
    if (to) sentRange.$lte = to;
    const sentFilter = Object.keys(sentRange).length ? { sentAt: sentRange } : {};

    const [sent, failed, bounced, pending, cancelled, unsubscribed, totalCampaigns, activeCampaigns, uniqueOpens, uniqueClicks] =
      await Promise.all([
        EmailJobModel.countDocuments({ ...sentFilter, status: 'sent' }),
        EmailJobModel.countDocuments({ status: 'failed' }),
        EmailJobModel.countDocuments({ status: 'failed', bounced: true }),
        EmailJobModel.countDocuments({ status: { $in: ['queued', 'sending', 'retrying'] } }),
        EmailJobModel.countDocuments({ status: 'cancelled' }),
        EmailJobModel.countDocuments({ status: 'unsubscribed' }),
        CampaignModel.countDocuments({}),
        CampaignModel.countDocuments({ status: { $in: ['running', 'paused', 'queued', 'scheduled'] } }),
        EmailJobModel.countDocuments({ openCount: { $gt: 0 } }),
        EmailJobModel.countDocuments({ clickCount: { $gt: 0 } }),
      ]);

    return {
      totalSent: sent,
      delivered: sent,
      failed,
      bounced,
      pending,
      cancelled,
      unsubscribed,
      totalCampaigns,
      activeCampaigns,
      uniqueOpens,
      uniqueClicks,
      openRate: sent > 0 ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0,
      clickRate: sent > 0 ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0,
    };
  }

  /** Same shape as getSummary, but scoped to a single campaign — used by the Campaign detail page. */
  async getCampaignSummary(campaignId: string): Promise<DashboardSummary> {
    const [sent, failed, bounced, pending, cancelled, unsubscribed, uniqueOpens, uniqueClicks] = await Promise.all([
      EmailJobModel.countDocuments({ campaignId, status: 'sent' }),
      EmailJobModel.countDocuments({ campaignId, status: 'failed' }),
      EmailJobModel.countDocuments({ campaignId, status: 'failed', bounced: true }),
      EmailJobModel.countDocuments({ campaignId, status: { $in: ['queued', 'sending', 'retrying'] } }),
      EmailJobModel.countDocuments({ campaignId, status: 'cancelled' }),
      EmailJobModel.countDocuments({ campaignId, status: 'unsubscribed' }),
      EmailJobModel.countDocuments({ campaignId, openCount: { $gt: 0 } }),
      EmailJobModel.countDocuments({ campaignId, clickCount: { $gt: 0 } }),
    ]);

    return {
      totalSent: sent,
      delivered: sent,
      failed,
      bounced,
      pending,
      cancelled,
      unsubscribed,
      totalCampaigns: 1,
      activeCampaigns: 0,
      uniqueOpens,
      uniqueClicks,
      openRate: sent > 0 ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0,
      clickRate: sent > 0 ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0,
    };
  }

  async getTimeSeries(granularity: DashboardGranularity, from: Date, to: Date): Promise<TimeSeriesPoint[]> {
    const dateFormat = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const [sendRows, eventRows] = await Promise.all([
      EmailLogModel.aggregate<{ _id: { period: string; status: string }; count: number }>([
        {
          $match: {
            createdAt: { $gte: from, $lte: to },
            status: { $in: ['sent', 'failed'] },
          },
        },
        {
          $group: {
            _id: {
              period: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
      ]),
      EmailEventModel.aggregate<{ _id: { period: string; type: string }; count: number }>([
        {
          $match: {
            createdAt: { $gte: from, $lte: to },
            type: { $in: ['open', 'click'] },
          },
        },
        {
          $group: {
            _id: {
              period: { $dateToString: { format: dateFormat, date: '$createdAt' } },
              type: '$type',
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const byPeriod = new Map<string, { sent: number; failed: number; opened: number; clicked: number }>();
    const getEntry = (period: string) => {
      const entry = byPeriod.get(period) ?? { sent: 0, failed: 0, opened: 0, clicked: 0 };
      byPeriod.set(period, entry);
      return entry;
    };

    for (const row of sendRows) {
      const entry = getEntry(row._id.period);
      if (row._id.status === 'sent') entry.sent = row.count;
      if (row._id.status === 'failed') entry.failed = row.count;
    }
    for (const row of eventRows) {
      const entry = getEntry(row._id.period);
      if (row._id.type === 'open') entry.opened = row.count;
      if (row._id.type === 'click') entry.clicked = row.count;
    }

    return Array.from(byPeriod.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([period, counts]) => ({
        period,
        sent: counts.sent,
        delivered: counts.sent,
        failed: counts.failed,
        opened: counts.opened,
        clicked: counts.clicked,
      }));
  }
}

export const dashboardService = new DashboardService();