import { Schema, model, Document, Types } from 'mongoose';

export interface IContact extends Document {
  importBatchId: Types.ObjectId;
  email: string;
  fields: Record<string, string>; // all raw CSV columns, including "email"
  isValidEmail: boolean;
  isDuplicate: boolean;
  missingRequiredFields: string[];
  attachmentFileName?: string; // resolved from CSV column, if configured
  unsubscribed: boolean;
  excluded: boolean; // manually removed by user in UI
  lists: Types.ObjectId[]; // membership in ContactList "groups" for the Contacts page
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    fields: { type: Schema.Types.Mixed, default: {} },
    isValidEmail: { type: Boolean, default: false },
    isDuplicate: { type: Boolean, default: false },
    missingRequiredFields: { type: [String], default: [] },
    attachmentFileName: { type: String },
    unsubscribed: { type: Boolean, default: false, index: true },
    excluded: { type: Boolean, default: false },
    lists: [{ type: Schema.Types.ObjectId, ref: 'ContactList', default: [] }],
  },
  { timestamps: true },
);

ContactSchema.index({ importBatchId: 1, email: 1 });
ContactSchema.index({ email: 1 });

export const ContactModel = model<IContact>('Contact', ContactSchema);