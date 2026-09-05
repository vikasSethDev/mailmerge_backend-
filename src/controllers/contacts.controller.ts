import { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../utils/asyncHandler.util';
import { contactService } from '../services/contact.service';
import { contactListService } from '../services/contactList.service';
import { contactListInputSchema, contactListMembershipSchema } from '../validators/mailmerge.validator';
import { ok } from '../types/dto';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export const contactsController = {
  // GET /api/mailmerge/contacts?search=&listId=&importBatchId=&unsubscribed=&duplicatesOnly=&page=&limit=
  list: asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 25);
    const search = req.query.search ? String(req.query.search) : undefined;
    const listId = req.query.listId ? String(req.query.listId) : undefined;
    const importBatchId = req.query.importBatchId ? String(req.query.importBatchId) : undefined;
    const unsubscribed =
      req.query.unsubscribed !== undefined ? String(req.query.unsubscribed) === 'true' : undefined;
    const duplicatesOnly = String(req.query.duplicatesOnly ?? '') === 'true';

    const result = await contactService.listAll({
      search,
      listId,
      importBatchId,
      unsubscribed,
      duplicatesOnly,
      page,
      limit,
    });
    res.json(ok(result));
  }),

  // GET /api/mailmerge/suppressions
  listSuppressed: asyncHandler(async (_req: Request, res: Response) => {
    const emails = await contactService.listSuppressed();
    res.json(ok({ emails, total: emails.length }));
  }),

  // POST /api/mailmerge/suppressions { email }
  addSuppression: asyncHandler(async (req: Request, res: Response) => {
    const email = String(req.body.email ?? '');
    if (!email) throw new ApiError(400, 'email is required');
    await contactService.markUnsubscribed(email);
    res.json(ok({ suppressed: true, email }));
  }),

  // DELETE /api/mailmerge/suppressions/:email
  removeSuppression: asyncHandler(async (req: Request, res: Response) => {
    const email = decodeURIComponent(req.params.email);
    await contactService.markResubscribed(email);
    res.json(ok({ resubscribed: true, email }));
  }),

  // ---------------- Contact lists / groups ----------------

  // GET /api/mailmerge/contact-lists
  listGroups: asyncHandler(async (_req: Request, res: Response) => {
    const lists = await contactListService.list();
    res.json(ok(lists));
  }),

  // POST /api/mailmerge/contact-lists
  createGroup: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = contactListInputSchema.parse(req.body);
    const list = await contactListService.create(dto, req.user?.email);
    res.status(201).json(ok(list));
  }),

  // PUT /api/mailmerge/contact-lists/:listId
  updateGroup: asyncHandler(async (req: Request, res: Response) => {
    const dto = contactListInputSchema.partial().parse(req.body);
    const list = await contactListService.update(req.params.listId, dto);
    res.json(ok(list));
  }),

  // DELETE /api/mailmerge/contact-lists/:listId
  removeGroup: asyncHandler(async (req: Request, res: Response) => {
    await contactListService.remove(req.params.listId);
    res.json(ok({ removed: true }));
  }),

  // POST /api/mailmerge/contact-lists/membership { contactIds, listIds, action }
  updateMembership: asyncHandler(async (req: Request, res: Response) => {
    const dto = contactListMembershipSchema.parse(req.body);
    const modifiedCount = await contactListService.setMembership(dto.contactIds, dto.listIds, dto.action);
    res.json(ok({ modifiedCount }));
  }),
};