import { Schema, model, Document } from 'mongoose';

/**
 * A user-defined recipient group ("list"), e.g. "Newsletter subscribers" or
 * "VIP customers". Contacts reference lists they belong to via Contact.lists,
 * so a contact can belong to many lists and a list can span multiple CSV
 * import batches.
 */
export interface IContactList extends Document {
  name: string;
  description?: string;
  color?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactListSchema = new Schema<IContactList>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    color: { type: String, default: '#6366F1' },
    createdBy: { type: String },
  },
  { timestamps: true },
);

export const ContactListModel = model<IContactList>('ContactList', ContactListSchema);