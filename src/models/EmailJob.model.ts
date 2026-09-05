import { Schema, model, Document, Types } from 'mongoose';

export type EmailJobStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'skipped'
  | 'unsubscribed';

export interface IEmailJobAttachment {
  attachmentId?: Types.ObjectId;
  fileName: string;
  path: string;
}

export interface IEmailJob extends Document {
  campaignId: Types.ObjectId;
  contactId: Types.ObjectId;
  recipient: string;
  cc?: string[];
  bcc?: string[];
  fromName: string;
  fromEmail: string;
  subject: string;
  personalizedBody: string;
  attachments: IEmailJobAttachment[];
  status: EmailJobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  bounced: boolean;
  openedAt?: Date;
  openCount: number;
  clickedAt?: Date;
  clickCount: number;
  createdAt: Date;
  sentAt?: Date;
  updatedAt: Date;
}

const EmailJobAttachmentSchema = new Schema<IEmailJobAttachment>(
  {
    attachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment' },
    fileName: { type: String, required: true },
    path: { type: String, required: true },
  },
  { _id: false },
);

const EmailJobSchema = new Schema<IEmailJob>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    recipient: { type: String, required: true, index: true },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    fromName: { type: String, required: true },
    fromEmail: { type: String, required: true },
    subject: { type: String, required: true },
    personalizedBody: { type: String, required: true },
    attachments: { type: [EmailJobAttachmentSchema], default: [] },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed', 'retrying', 'cancelled', 'skipped', 'unsubscribed'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    errorMessage: { type: String },
    bounced: { type: Boolean, default: false, index: true },
    sentAt: { type: Date },
    openedAt: { type: Date },
    openCount: { type: Number, default: 0 },
    clickedAt: { type: Date },
    clickCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

EmailJobSchema.index({ campaignId: 1, status: 1 });

export const EmailJobModel = model<IEmailJob>('EmailJob', EmailJobSchema);