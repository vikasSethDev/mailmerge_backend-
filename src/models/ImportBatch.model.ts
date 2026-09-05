import { Schema, model, Document } from 'mongoose';

export interface IImportBatch extends Document {
  originalFileName: string;
  headers: string[];
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  uploadedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ImportBatchSchema = new Schema<IImportBatch>(
  {
    originalFileName: { type: String, required: true },
    headers: { type: [String], default: [] },
    totalRecords: { type: Number, default: 0 },
    validRecords: { type: Number, default: 0 },
    invalidRecords: { type: Number, default: 0 },
    duplicateRecords: { type: Number, default: 0 },
    uploadedBy: { type: String },
  },
  { timestamps: true },
);

export const ImportBatchModel = model<IImportBatch>('ImportBatch', ImportBatchSchema);
