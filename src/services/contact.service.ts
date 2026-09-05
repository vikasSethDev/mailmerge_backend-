import fs from 'fs/promises';
import { Types, FilterQuery } from 'mongoose';
import { parseCsv } from '../utils/csvParser.util';
import { ImportBatchModel } from '../models/ImportBatch.model';
import { ContactModel, IContact } from '../models/Contact.model';
import { ApiError } from '../utils/asyncHandler.util';

export interface ImportCsvResult {
  importBatchId: string;
  headers: string[];
  availableVariables: string[];
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  contacts: IContact[];
}

export interface ListAllContactsQuery {
  search?: string;
  listId?: string;
  importBatchId?: string;
  unsubscribed?: boolean;
  duplicatesOnly?: boolean;
  page: number;
  limit: number;
}

export interface ListAllContactsResult {
  contacts: IContact[];
  total: number;
  page: number;
  limit: number;
}

class ContactService {
  /** Parses the uploaded CSV, persists rows as Contact docs, no column is hardcoded. */
  async importCsv(filePath: string, originalFileName: string, requiredColumns: string[] = []): Promise<ImportCsvResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseCsv(content, requiredColumns);

    if (parsed.headers.length === 0) {
      throw new ApiError(400, 'CSV file has no headers or is empty');
    }
    if (!parsed.headers.some((h) => h.toLowerCase() === 'email')) {
      throw new ApiError(400, 'CSV must contain an "email" column');
    }

    const batch = await ImportBatchModel.create({
      originalFileName,
      headers: parsed.headers,
      totalRecords: parsed.totalRecords,
      validRecords: parsed.validRecords,
      invalidRecords: parsed.invalidRecords,
      duplicateRecords: parsed.duplicateRecords,
    });

    const contactDocs = parsed.rows.map((row) => ({
      importBatchId: batch._id,
      email: row.email,
      fields: row.fields,
      isValidEmail: row.isValidEmail,
      isDuplicate: row.isDuplicate,
      missingRequiredFields: row.missingRequiredFields,
      unsubscribed: false,
      excluded: false,
    }));

    const contacts = await ContactModel.insertMany(contactDocs);

    return {
      importBatchId: String(batch._id),
      headers: parsed.headers,
      availableVariables: parsed.headers, // every CSV column is a mail-merge variable
      totalRecords: parsed.totalRecords,
      validRecords: parsed.validRecords,
      invalidRecords: parsed.invalidRecords,
      duplicateRecords: parsed.duplicateRecords,
      contacts,
    };
  }

  async listByBatch(importBatchId: string): Promise<IContact[]> {
    this.assertValidId(importBatchId);
    return ContactModel.find({ importBatchId }).sort({ createdAt: 1 });
  }

  async getBatch(importBatchId: string) {
    this.assertValidId(importBatchId);
    const batch = await ImportBatchModel.findById(importBatchId).lean();
    if (!batch) throw new ApiError(404, 'Import batch not found');
    return batch;
  }

  async removeContact(contactId: string): Promise<void> {
    this.assertValidId(contactId);
    await ContactModel.findByIdAndUpdate(contactId, { excluded: true });
  }

  async removeInvalidContacts(importBatchId: string): Promise<number> {
    this.assertValidId(importBatchId);
    const result = await ContactModel.updateMany(
      { importBatchId, $or: [{ isValidEmail: false }, { isDuplicate: true }] },
      { excluded: true },
    );
    return result.modifiedCount ?? 0;
  }

  /** Contacts eligible for sending: not excluded, valid email, not a duplicate, unsubscribed excluded. */
  async listSendableContacts(importBatchId: string): Promise<IContact[]> {
    this.assertValidId(importBatchId);
    return ContactModel.find({
      importBatchId,
      excluded: false,
      isValidEmail: true,
      isDuplicate: false,
      unsubscribed: false,
    });
  }

  async markUnsubscribed(email: string): Promise<void> {
    await ContactModel.updateMany({ email: email.toLowerCase() }, { unsubscribed: true });
  }

  async markResubscribed(email: string): Promise<void> {
    await ContactModel.updateMany({ email: email.toLowerCase() }, { unsubscribed: false });
  }

  /** Distinct suppressed (unsubscribed) email addresses, for the Suppression List view. */
  async listSuppressed(): Promise<string[]> {
    return ContactModel.distinct('email', { unsubscribed: true });
  }

  /**
   * Cross-batch contact search/filter/pagination for the Contacts & Recipients page.
   * Unlike listByBatch (scoped to one CSV import), this spans every import batch so
   * a "list"/group can be built from contacts uploaded at different times.
   */
  async listAll(query: ListAllContactsQuery): Promise<ListAllContactsResult> {
    const filter: FilterQuery<IContact> = { excluded: false };

    if (query.importBatchId) {
      this.assertValidId(query.importBatchId);
      filter.importBatchId = query.importBatchId;
    }
    if (query.listId) {
      if (!Types.ObjectId.isValid(query.listId)) throw new ApiError(400, 'Invalid listId');
      filter.lists = query.listId;
    }
    if (query.unsubscribed !== undefined) {
      filter.unsubscribed = query.unsubscribed;
    }
    if (query.duplicatesOnly) {
      filter.isDuplicate = true;
    }
    if (query.search && query.search.trim().length > 0) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ email: { $regex: escaped, $options: 'i' } }, { 'fields.name': { $regex: escaped, $options: 'i' } }];
    }

    const page = Math.max(1, query.page);
    const limit = Math.min(Math.max(1, query.limit), 200);

    const [contacts, total] = await Promise.all([
      ContactModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('lists', 'name color')
        .lean(),
      ContactModel.countDocuments(filter),
    ]);

    return { contacts: contacts as unknown as IContact[], total, page, limit };
  }

  private assertValidId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid identifier');
  }
}

export const contactService = new ContactService();