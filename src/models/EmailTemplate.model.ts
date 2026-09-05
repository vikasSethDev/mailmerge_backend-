import { Schema, model, Document } from 'mongoose';

export interface IEmailTemplate extends Document {
  name: string;
  fromName: string;
  fromEmail: string;
  toTemplate: string; // usually "{{email}}"
  ccTemplate?: string;
  bccTemplate?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  variablesUsed: string[];
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true },
    fromName: { type: String, required: true },
    fromEmail: { type: String, required: true },
    toTemplate: { type: String, required: true, default: '{{email}}' },
    ccTemplate: { type: String },
    bccTemplate: { type: String },
    subjectTemplate: { type: String, required: true },
    bodyHtmlTemplate: { type: String, required: true },
    variablesUsed: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const EmailTemplateModel = model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
