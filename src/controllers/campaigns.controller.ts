import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.util';
import { campaignService } from '../services/campaign.service';
import { campaignControlService } from '../services/campaignControl.service';
import { dashboardService } from '../services/dashboard.service';
import { scheduleCampaignSchema } from '../validators/mailmerge.validator';
import { CampaignStatus } from '../models/Campaign.model';
import { ok } from '../types/dto';

export const campaignsController = {
  // GET /api/mailmerge/campaigns?search=&status=&page=&limit=
  list: asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = req.query.search ? String(req.query.search) : undefined;
    const status = req.query.status ? (String(req.query.status) as CampaignStatus) : undefined;

    const result = await campaignService.list({ search, status, page, limit });
    res.json(ok(result));
  }),

  // GET /api/mailmerge/campaigns/:campaignId — full detail for the Campaign detail view
  getOne: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignService.getById(req.params.campaignId);
    const [statusInfo, analytics] = await Promise.all([
      campaignControlService.getStatus(req.params.campaignId),
      dashboardService.getCampaignSummary(req.params.campaignId),
    ]);
    res.json(ok({ campaign, status: statusInfo, analytics }));
  }),

  // DELETE /api/mailmerge/campaigns/:campaignId
  remove: asyncHandler(async (req: Request, res: Response) => {
    await campaignService.remove(req.params.campaignId);
    res.json(ok({ removed: true }));
  }),

  // POST /api/mailmerge/:campaignId/retry-failed
  retryFailed: asyncHandler(async (req: Request, res: Response) => {
    const result = await campaignControlService.retryFailed(req.params.campaignId);
    res.json(ok(result));
  }),

  // POST /api/mailmerge/:campaignId/schedule
  schedule: asyncHandler(async (req: Request, res: Response) => {
    const dto = scheduleCampaignSchema.parse(req.body);
    const campaign = await campaignControlService.schedule(req.params.campaignId, new Date(dto.scheduledAt), dto.timezone);
    res.json(ok(campaign));
  }),

  // POST /api/mailmerge/:campaignId/unschedule
  unschedule: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignControlService.unschedule(req.params.campaignId);
    res.json(ok(campaign));
  }),
};