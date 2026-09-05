import { Schema, model, Document, Types } from 'mongoose';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** How the campaign was (or will be) dispatched. Distinct from `status`, which tracks lifecycle. */
export type SendMode = 'now' | 'scheduled' | 'draft';

export type AttachmentMode = 'none' | 'same-for-all' | 'per-recipient-csv-column';

export interface ICampaignRateLimits {
  perMinute: number;
  perHour: number;
  perDay: number;
}

export interface ICampaignStats {
  total: number;
  valid: number;
  invalidEmail: number;
  duplicate: number;
  missingData: number;
  missingAttachment: number;
  unsubscribed: number;
  sent: number;
  queued: number;
  failed: number;
  retrying: number;
  cancelled: number;
  skipped: number;
}

export interface ICampaign extends Document {
  name: string;
  importBatchId: Types.ObjectId;
  templateId: Types.ObjectId;
  attachmentMode: AttachmentMode;
  sameAttachmentIds: Types.ObjectId[]; // used when attachmentMode = same-for-all
  attachmentCsvColumn?: string; // used when attachmentMode = per-recipient-csv-column
  rateLimits: ICampaignRateLimits;
  status: CampaignStatus;
  sendMode: SendMode;
  scheduledAt?: Date;
  timezone?: string;
  stats: ICampaignStats;
  createdBy?: string;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RateLimitsSchema = new Schema<ICampaignRateLimits>(
  {
    perMinute: { type: Number, required: true, default: 5 },
    perHour: { type: Number, required: true, default: 100 },
    perDay: { type: Number, required: true, default: 500 },
  },
  { _id: false },
);

const StatsSchema = new Schema<ICampaignStats>(
  {
    total: { type: Number, default: 0 },
    valid: { type: Number, default: 0 },
    invalidEmail: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    missingData: { type: Number, default: 0 },
    missingAttachment: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    retrying: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false },
);

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate', required: true },
    attachmentMode: {
      type: String,
      enum: ['none', 'same-for-all', 'per-recipient-csv-column'],
      default: 'none',
    },
    sameAttachmentIds: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
    attachmentCsvColumn: { type: String },
    rateLimits: { type: RateLimitsSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed'],
      default: 'draft',
      index: true,
    },
    sendMode: {
      type: String,
      enum: ['now', 'scheduled', 'draft'],
      default: 'draft',
    },
    scheduledAt: { type: Date, index: true },
    timezone: { type: String },
    stats: { type: StatsSchema, default: () => ({}) },
    createdBy: { type: String },
    startedAt: { type: Date },
    pausedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

export const CampaignModel = model<ICampaign>('Campaign', CampaignSchema);