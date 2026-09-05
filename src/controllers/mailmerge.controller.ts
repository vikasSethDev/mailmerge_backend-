import { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../utils/asyncHandler.util';
import { contactService } from '../services/contact.service';
import { attachmentService } from '../services/attachment.service';
import { previewService } from '../services/preview.service';
import { campaignService } from '../services/campaign.service';
import { campaignControlService } from '../services/campaignControl.service';
import { mailSenderService } from '../services/mailSender.service';
import { dashboardService } from '../services/dashboard.service';
import { trackingService, TRANSPARENT_GIF_BUFFER } from '../services/tracking.service';
import { EmailLogModel } from '../models/EmailLog.model';
import { ContactModel } from '../models/Contact.model';
import {
  createCampaignSchema,
  previewSchema,
  sendTestSchema,
} from '../validators/mailmerge.validator';
import { ok } from '../types/dto';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { googleAuthService } from '../services/googleAuth.service';

export const mailMergeController = {
  // POST /api/mailmerge/import-csv
  importCsv: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ApiError(400, 'CSV file is required (field name: "file")');
    const requiredColumns: string[] = req.body.requiredColumns ? JSON.parse(req.body.requiredColumns) : [];

    const result = await contactService.importCsv(req.file.path, req.file.originalname, requiredColumns);
    res.status(201).json(ok(result));
  }),

  // GET /api/mailmerge/import-batch/:importBatchId/contacts
  listContacts: asyncHandler(async (req: Request, res: Response) => {
    const contacts = await contactService.listByBatch(req.params.importBatchId);
    const batch = await contactService.getBatch(req.params.importBatchId);
    res.json(ok({ batch, contacts }));
  }),

  // DELETE /api/mailmerge/contacts/:contactId
  removeContact: asyncHandler(async (req: Request, res: Response) => {
    await contactService.removeContact(req.params.contactId);
    res.json(ok({ removed: true }));
  }),

  // POST /api/mailmerge/import-batch/:importBatchId/remove-invalid
  removeInvalidContacts: asyncHandler(async (req: Request, res: Response) => {
    const count = await contactService.removeInvalidContacts(req.params.importBatchId);
    res.json(ok({ removedCount: count }));
  }),

  // POST /api/mailmerge/upload-attachment
  uploadAttachment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ApiError(400, 'Attachment file is required (field name: "file")');
    const attachment = await attachmentService.saveUploaded(req.file);
    res.status(201).json(ok(attachment));
  }),

  // DELETE /api/mailmerge/attachments/:attachmentId
  removeAttachment: asyncHandler(async (req: Request, res: Response) => {
    await attachmentService.remove(req.params.attachmentId);
    res.json(ok({ removed: true }));
  }),

  // POST /api/mailmerge/preview
  preview: asyncHandler(async (req: Request, res: Response) => {
    const dto = previewSchema.parse(req.body);
    const contacts = await contactService.listSendableContacts(dto.importBatchId);

    if (contacts.length === 0) throw new ApiError(400, 'No valid contacts to preview');
    const index = Math.min(dto.contactIndex, contacts.length - 1);
    const contact = contacts[index];

    const rendered = await previewService.renderFull(dto.template, contact as any, {
      attachmentMode: dto.attachmentMode,
      sameAttachmentIds: dto.sameAttachmentIds,
      attachmentCsvColumn: dto.attachmentCsvColumn,
    });

    res.json(
      ok({
        rendered,
        pagination: { index, total: contacts.length },
        contact: { id: contact._id, email: contact.email, fields: contact.fields },
      }),
    );
  }),

  // POST /api/mailmerge/send-test
  sendTest: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = sendTestSchema.parse(req.body);
    const contact = await ContactModel.findOne({ _id: dto.contactId, importBatchId: dto.importBatchId });
    if (!contact) throw new ApiError(404, 'Contact not found in this import batch');

    const rendered = await previewService.renderFull(
      { ...dto.template, toTemplate: '{{email}}' },
      contact,
      {
        attachmentMode: dto.attachmentMode,
        sameAttachmentIds: dto.sameAttachmentIds,
        attachmentCsvColumn: dto.attachmentCsvColumn,
      },
    );

    const ownerEmail = req.user?.email ?? '';
    if (!ownerEmail) throw new ApiError(401, 'Sign in with Google before sending email.');
    const connectedAccount = await googleAuthService.getConnectedAccount(ownerEmail);
    if (!connectedAccount) throw new ApiError(400, 'Connect Gmail before sending email.');

    const result = await mailSenderService.sendTest({
      ownerEmail,
      fromName: connectedAccount.displayName || dto.template.fromName,
      fromEmail: connectedAccount.email,
      subject: rendered.subject,
      html: rendered.html,
      testEmail: dto.testEmail,
      attachments: rendered.attachments
        .filter((a) => a.resolved && a.path)
        .map((a) => ({ filename: a.fileName, path: a.path as string })),
    });

    res.json(ok({ sent: true, messageId: result.messageId, sentTo: dto.testEmail, previewedContact: contact.email }));
  }),

  // POST /api/mailmerge/validate
  validate: asyncHandler(async (req: Request, res: Response) => {
    const { importBatchId, attachmentMode, attachmentCsvColumn } = req.body;
    if (!importBatchId) throw new ApiError(400, 'importBatchId is required');
    const summary = await campaignService.validate(importBatchId, attachmentMode ?? 'none', attachmentCsvColumn);
    res.json(ok(summary));
  }),

  // POST /api/mailmerge/create-campaign
  createCampaign: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = createCampaignSchema.parse(req.body);
    const ownerEmail = req.user?.email ?? '';
    if (!ownerEmail) throw new ApiError(401, 'Sign in with Google before creating a campaign.');
    const connectedAccount = await googleAuthService.getConnectedAccount(ownerEmail);
    if (!connectedAccount) throw new ApiError(400, 'Connect Gmail before creating a campaign.');

    // The connected OAuth Gmail account is authoritative for the sender.
    // Never trust a client-supplied From email when sending through Gmail API.
    const template = {
      ...dto.template,
      fromEmail: connectedAccount.email,
      fromName: connectedAccount.displayName || dto.template.fromName,
    };
    const campaign = await campaignService.createCampaign(
      { ...dto, template },
      ownerEmail,
    );
    res.status(201).json(ok(campaign));
  }),

  // POST /api/mailmerge/:campaignId/start
  start: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignControlService.start(req.params.campaignId);
    res.json(ok(campaign));
  }),

  // POST /api/mailmerge/:campaignId/pause
  pause: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignControlService.pause(req.params.campaignId);
    res.json(ok(campaign));
  }),

  // POST /api/mailmerge/:campaignId/resume
  resume: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignControlService.resume(req.params.campaignId);
    res.json(ok(campaign));
  }),

  // POST /api/mailmerge/:campaignId/cancel
  cancel: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignControlService.cancel(req.params.campaignId);
    res.json(ok(campaign));
  }),

  // GET /api/mailmerge/:campaignId/status
  status: asyncHandler(async (req: Request, res: Response) => {
    const status = await campaignControlService.getStatus(req.params.campaignId);
    res.json(ok(status));
  }),

  // GET /api/mailmerge/:campaignId/logs
  logs: asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const statusFilter = req.query.status as string | undefined;

    const filter: Record<string, unknown> = { campaignId: req.params.campaignId };
    if (statusFilter) filter.status = statusFilter;

    const [logs, total] = await Promise.all([
      EmailLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailLogModel.countDocuments(filter),
    ]);

    res.json(ok({ logs, total, page, limit }));
  }),

  // GET /api/mailmerge/dashboard/summary?from=&to=
  dashboardSummary: asyncHandler(async (req: Request, res: Response) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const summary = await dashboardService.getSummary(from, to);
    res.json(ok(summary));
  }),

  // GET /api/mailmerge/dashboard/timeseries?granularity=day|month&days=30
  dashboardTimeseries: asyncHandler(async (req: Request, res: Response) => {
    const granularity = req.query.granularity === 'month' ? 'month' : 'day';
    const defaultDays = granularity === 'month' ? 365 : 30;
    const days = Math.min(Math.max(Number(req.query.days ?? defaultDays), 1), 730);

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const series = await dashboardService.getTimeSeries(granularity, from, to);
    res.json(ok({ granularity, from: from.toISOString(), to: to.toISOString(), points: series }));
  }),

  // GET /api/mailmerge/unsubscribe?email=...&campaignId=...
  unsubscribe: asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.query.email ?? '');
    if (!email) throw new ApiError(400, 'email query parameter is required');
    await contactService.markUnsubscribed(email);
    res.json(ok({ unsubscribed: true, email }));
  }),

  // GET /api/mailmerge/track/open/:emailJobId.png — public, hit by the recipient's mail client.
  trackOpen: asyncHandler(async (req: Request, res: Response) => {
    const emailJobId = req.params.emailJobId.replace(/\.png$/i, '');
    await trackingService.recordOpen(emailJobId, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    });

    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(TRANSPARENT_GIF_BUFFER);
  }),

  // GET /api/mailmerge/track/click/:emailJobId?u=<encoded original URL> — public, redirects the recipient on.
  trackClick: asyncHandler(async (req: Request, res: Response) => {
    const destination = await trackingService.recordClick(req.params.emailJobId, req.query.u as string | undefined, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    });

    if (!destination) throw new ApiError(400, 'Invalid or missing tracked link');
    res.redirect(302, destination);
  }),
};
