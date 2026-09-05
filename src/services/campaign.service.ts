import { Types, FilterQuery } from 'mongoose';
import { CampaignModel, ICampaign, AttachmentMode, CampaignStatus, SendMode } from '../models/Campaign.model';
import { ContactModel, IContact } from '../models/Contact.model';
import { ImportBatchModel } from '../models/ImportBatch.model';
import { templateService, TemplateInput } from './template.service';
import { attachmentService } from './attachment.service';
import { ApiError } from '../utils/asyncHandler.util';
import { env } from '../config/env';

export interface ValidationRowError {
  rowNumber: number;
  email: string;
  error: string;
}

export interface ValidationSummary {
  totalRecords: number;
  valid: number;
  invalidEmail: number;
  duplicate: number;
  missingData: number;
  missingAttachment: number;
  unsubscribed: number;
  errors: ValidationRowError[];
}

export interface CreateCampaignInput {
  name: string;
  importBatchId: string;
  template: TemplateInput;
  attachmentMode: AttachmentMode;
  sameAttachmentIds?: string[];
  attachmentCsvColumn?: string;
  rateLimits?: { perMinute: number; perHour: number; perDay: number };
  sendMode?: SendMode;
  scheduledAt?: string;
  timezone?: string;
}

export interface ListCampaignsQuery {
  search?: string;
  status?: CampaignStatus;
  page: number;
  limit: number;
}

export interface ListCampaignsResult {
  campaigns: ICampaign[];
  total: number;
  page: number;
  limit: number;
}

class CampaignService {
  /** Computes the validation summary shown before starting a mail merge. Nothing is queued yet. */
  async validate(
    importBatchId: string,
    attachmentMode: AttachmentMode,
    attachmentCsvColumn?: string,
  ): Promise<ValidationSummary> {
    if (!Types.ObjectId.isValid(importBatchId)) throw new ApiError(400, 'Invalid importBatchId');

    const contacts = await ContactModel.find({ importBatchId }).sort({ createdAt: 1 });

    const errors: ValidationRowError[] = [];
    let valid = 0;
    let invalidEmail = 0;
    let duplicate = 0;
    let missingData = 0;
    let missingAttachment = 0;
    let unsubscribed = 0;

    let rowNumber = 0;
    for (const contact of contacts) {
      rowNumber += 1;
      if (contact.excluded) continue;

      if (contact.unsubscribed) {
        unsubscribed += 1;
        errors.push({ rowNumber, email: contact.email, error: 'Contact has unsubscribed' });
        continue;
      }
      if (!contact.isValidEmail) {
        invalidEmail += 1;
        errors.push({ rowNumber, email: contact.email || '(empty)', error: 'Invalid email format' });
        continue;
      }
      if (contact.isDuplicate) {
        duplicate += 1;
        errors.push({ rowNumber, email: contact.email, error: 'Duplicate email' });
        continue;
      }
      if (contact.missingRequiredFields.length > 0) {
        missingData += 1;
        errors.push({
          rowNumber,
          email: contact.email,
          error: `Missing required field(s): ${contact.missingRequiredFields.join(', ')}`,
        });
        continue;
      }
      if (attachmentMode === 'per-recipient-csv-column') {
        const fileName = attachmentCsvColumn ? contact.fields[attachmentCsvColumn] : undefined;
        if (!fileName) {
          missingAttachment += 1;
          errors.push({ rowNumber, email: contact.email, error: 'Missing attachment file name in CSV' });
          continue;
        }
        const resolved = await attachmentService.resolveByOriginalName(fileName);
        if (!resolved) {
          missingAttachment += 1;
          errors.push({ rowNumber, email: contact.email, error: `Attachment file not uploaded: ${fileName}` });
          continue;
        }
      }

      valid += 1;
    }

    return {
      totalRecords: contacts.length,
      valid,
      invalidEmail,
      duplicate,
      missingData,
      missingAttachment,
      unsubscribed,
      errors,
    };
  }

  async createCampaign(input: CreateCampaignInput, createdBy?: string): Promise<ICampaign> {
    const batch = await ImportBatchModel.findById(input.importBatchId);
    if (!batch) throw new ApiError(404, 'Import batch not found');

    const template = await templateService.create(input.template);

    const validation = await this.validate(input.importBatchId, input.attachmentMode, input.attachmentCsvColumn);

    const sendMode = input.sendMode ?? 'draft';
    const scheduledAt = sendMode === 'scheduled' && input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    if (sendMode === 'scheduled' && (!scheduledAt || scheduledAt.getTime() <= Date.now())) {
      throw new ApiError(400, 'scheduledAt must be a valid future date when sendMode is "scheduled"');
    }

    const campaign = await CampaignModel.create({
      name: input.name,
      importBatchId: input.importBatchId,
      templateId: template._id,
      attachmentMode: input.attachmentMode,
      sameAttachmentIds: input.sameAttachmentIds ?? [],
      attachmentCsvColumn: input.attachmentCsvColumn,
      rateLimits: input.rateLimits ?? env.defaultRateLimits,
      status: sendMode === 'scheduled' ? 'scheduled' : 'draft',
      sendMode,
      scheduledAt,
      timezone: input.timezone,
      stats: {
        total: validation.totalRecords,
        valid: validation.valid,
        invalidEmail: validation.invalidEmail,
        duplicate: validation.duplicate,
        missingData: validation.missingData,
        missingAttachment: validation.missingAttachment,
        unsubscribed: validation.unsubscribed,
        sent: 0,
        queued: 0,
        failed: 0,
        retrying: 0,
        cancelled: 0,
        skipped: 0,
      },
      createdBy,
    });

    return campaign;
  }

  async getById(campaignId: string): Promise<ICampaign> {
    if (!Types.ObjectId.isValid(campaignId)) throw new ApiError(400, 'Invalid campaignId');
    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    return campaign;
  }

  /** Powers the Campaigns page: search by name, filter by status, paginated, newest first. */
  async list(query: ListCampaignsQuery): Promise<ListCampaignsResult> {
    const filter: FilterQuery<ICampaign> = {};
    if (query.status) filter.status = query.status;
    if (query.search && query.search.trim().length > 0) {
      filter.name = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
    }

    const page = Math.max(1, query.page);
    const limit = Math.min(Math.max(1, query.limit), 100);

    const [campaigns, total] = await Promise.all([
      CampaignModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('templateId', 'name subjectTemplate')
        .populate('importBatchId', 'originalFileName')
        .lean(),
      CampaignModel.countDocuments(filter),
    ]);

    return { campaigns: campaigns as unknown as ICampaign[], total, page, limit };
  }

  async remove(campaignId: string): Promise<void> {
    const campaign = await this.getById(campaignId);
    if (['running', 'sending'].includes(campaign.status)) {
      throw new ApiError(409, 'Pause or cancel a running campaign before deleting it');
    }
    await CampaignModel.findByIdAndDelete(campaignId);
  }

  async getSendableContactsForCampaign(campaign: ICampaign): Promise<IContact[]> {
    return ContactModel.find({
      importBatchId: campaign.importBatchId,
      excluded: false,
      isValidEmail: true,
      isDuplicate: false,
      unsubscribed: false,
    });
  }
}

export const campaignService = new CampaignService();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}