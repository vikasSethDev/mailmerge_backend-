import { Schema, model, Document } from 'mongoose';

export interface IAttachment extends Document {
  originalName: string;
  storedName: string; // name on disk, randomized to avoid collisions/traversal
  path: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, unique: true },
    path: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedBy: { type: String },
  },
  { timestamps: true },
);

export const AttachmentModel = model<IAttachment>('Attachment', AttachmentSchema);
