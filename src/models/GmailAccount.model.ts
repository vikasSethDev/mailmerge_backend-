import { Schema, model, Document } from 'mongoose';

export interface IGmailAccount extends Document {
  googleSub: string;
  email: string;
  displayName?: string;
  picture?: string;
  encryptedRefreshToken: string;
  encryptedAccessToken?: string;
  accessTokenExpiresAt?: Date;
  scopes: string[];
  connectedAt: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GmailAccountSchema = new Schema<IGmailAccount>(
  {
    googleSub: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    displayName: String,
    picture: String,
    encryptedRefreshToken: { type: String, required: true },
    encryptedAccessToken: String,
    accessTokenExpiresAt: Date,
    scopes: { type: [String], default: [] },
    connectedAt: { type: Date, default: Date.now },
    lastUsedAt: Date,
  },
  { timestamps: true },
);

export const GmailAccountModel = model<IGmailAccount>('GmailAccount', GmailAccountSchema);
