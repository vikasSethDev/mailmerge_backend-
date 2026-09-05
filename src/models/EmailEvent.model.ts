import { Schema, model, Document, Types } from 'mongoose';

export type EmailEventType = 'open' | 'click';

/**
 * EmailEvent is an append-only audit trail of engagement events (opens via
 * tracking pixel, clicks via link redirect). Every event is recorded here in
 * addition to the rollup counters (openCount/clickCount, openedAt/clickedAt)
 * kept on EmailJob for fast reads.
 */
export interface IEmailEvent extends Document {
  campaignId: Types.ObjectId;
  emailJobId: Types.ObjectId;
  recipient: string;
  type: EmailEventType;
  url?: string; // original destination URL, for 'click' events only
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
}

const EmailEventSchema = new Schema<IEmailEvent>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    emailJobId: { type: Schema.Types.ObjectId, ref: 'EmailJob', required: true, index: true },
    recipient: { type: String, required: true, index: true },
    type: { type: String, enum: ['open', 'click'], required: true, index: true },
    url: { type: String },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const EmailEventModel = model<IEmailEvent>('EmailEvent', EmailEventSchema);
