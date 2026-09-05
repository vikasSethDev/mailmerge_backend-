import { Schema, model, Document, Types } from 'mongoose';
import { EmailJobStatus } from './EmailJob.model';

/**
 * EmailLog is an append-only audit trail. Every attempt made by the worker
 * (success or failure) writes one entry here, in addition to updating the
 * mutable EmailJob document. This keeps a full history even across retries.
 */
export interface IEmailLog extends Document {
  campaignId: Types.ObjectId;
  emailJobId: Types.ObjectId;
  recipient: string;
  subject: string;
  status: EmailJobStatus;
  attemptNumber: number;
  errorMessage?: string;
  providerMessageId?: string;
  createdAt: Date;
  sentAt?: Date;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    emailJobId: { type: Schema.Types.ObjectId, ref: 'EmailJob', required: true },
    recipient: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed', 'retrying', 'cancelled', 'skipped', 'unsubscribed'],
      required: true,
      index: true,
    },
    attemptNumber: { type: Number, required: true },
    errorMessage: { type: String },
    providerMessageId: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const EmailLogModel = model<IEmailLog>('EmailLog', EmailLogSchema);
