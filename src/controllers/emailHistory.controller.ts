import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.util';
import { emailHistoryService } from '../services/emailHistory.service';
import { dashboardService } from '../services/dashboard.service';
import { EmailJobStatus } from '../models/EmailJob.model';
import { ok } from '../types/dto';

export const emailHistoryController = {
  // GET /api/mailmerge/email-history?search=&status=&campaignId=&from=&to=&page=&limit=
  list: asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = req.query.search ? String(req.query.search) : undefined;
    const status = req.query.status ? (String(req.query.status) as EmailJobStatus) : undefined;
    const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const result = await emailHistoryService.list({ search, status, campaignId, from, to, page, limit });
    res.json(ok(result));
  }),

  // GET /api/mailmerge/email-history/summary — same cross-campaign counters as the Dashboard KPIs
  summary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await dashboardService.getSummary();
    res.json(ok(summary));
  }),

  // GET /api/mailmerge/email-history/:emailJobId — full content + recipient + delivery detail
  getOne: asyncHandler(async (req: Request, res: Response) => {
    const detail = await emailHistoryService.getById(req.params.emailJobId);
    res.json(ok(detail));
  }),
};
