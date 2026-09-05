import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  importBatchId: z.string().min(1),
  template: z.object({
    name: z.string().min(1).default('Untitled template'),
    fromName: z.string().min(1),
    fromEmail: z.string().email(),
    toTemplate: z.string().min(1).default('{{email}}'),
    ccTemplate: z.string().optional(),
    bccTemplate: z.string().optional(),
    subjectTemplate: z.string().min(1),
    bodyHtmlTemplate: z.string().min(1),
  }),
  attachmentMode: z.enum(['none', 'same-for-all', 'per-recipient-csv-column']).default('none'),
  sameAttachmentIds: z.array(z.string()).optional().default([]),
  attachmentCsvColumn: z.string().optional(),
  rateLimits: z
    .object({
      perMinute: z.number().int().positive().max(1000),
      perHour: z.number().int().positive().max(20000),
      perDay: z.number().int().positive().max(100000),
    })
    .optional(),
  sendMode: z.enum(['now', 'scheduled', 'draft']).optional().default('draft'),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
});

export const scheduleCampaignSchema = z.object({
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be an ISO-8601 date-time string' }),
  timezone: z.string().min(1).default('UTC'),
});

export const templateInputSchema = z.object({
  name: z.string().min(1).optional(),
  fromName: z.string().min(1).optional(),
  fromEmail: z.string().email().optional(),
  toTemplate: z.string().optional(),
  ccTemplate: z.string().optional(),
  bccTemplate: z.string().optional(),
  subjectTemplate: z.string().min(1).optional(),
  bodyHtmlTemplate: z.string().min(1).optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  toTemplate: z.string().min(1).default('{{email}}'),
  ccTemplate: z.string().optional(),
  bccTemplate: z.string().optional(),
  subjectTemplate: z.string().min(1),
  bodyHtmlTemplate: z.string().min(1),
});

export const contactListInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const contactListMembershipSchema = z.object({
  contactIds: z.array(z.string()).min(1),
  listIds: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']).default('add'),
});

export const previewSchema = z.object({
  importBatchId: z.string().min(1),
  template: z.object({
    fromName: z.string().min(1),
    fromEmail: z.string().email(),
    toTemplate: z.string().min(1).default('{{email}}'),
    ccTemplate: z.string().optional(),
    bccTemplate: z.string().optional(),
    subjectTemplate: z.string().min(1),
    bodyHtmlTemplate: z.string().min(1),
  }),
  attachmentMode: z.enum(['none', 'same-for-all', 'per-recipient-csv-column']).default('none'),
  sameAttachmentIds: z.array(z.string()).optional().default([]),
  attachmentCsvColumn: z.string().optional(),
  contactIndex: z.number().int().min(0).default(0),
});

export const sendTestSchema = z.object({
  importBatchId: z.string().min(1),
  contactId: z.string().min(1),
  testEmail: z.string().email(),
  template: z.object({
    fromName: z.string().min(1),
    fromEmail: z.string().email(),
    subjectTemplate: z.string().min(1),
    bodyHtmlTemplate: z.string().min(1),
  }),
  attachmentMode: z.enum(['none', 'same-for-all', 'per-recipient-csv-column']).default('none'),
  sameAttachmentIds: z.array(z.string()).optional().default([]),
  attachmentCsvColumn: z.string().optional(),
});

export const importCsvSchema = z.object({
  requiredColumns: z.array(z.string()).optional().default([]),
});

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type PreviewDto = z.infer<typeof previewSchema>;
export type SendTestDto = z.infer<typeof sendTestSchema>;