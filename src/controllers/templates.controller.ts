import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.util';
import { templateService } from '../services/template.service';
import { createTemplateSchema, templateInputSchema } from '../validators/mailmerge.validator';
import { ok } from '../types/dto';

export const templatesController = {
  // GET /api/mailmerge/templates?search=
  list: asyncHandler(async (req: Request, res: Response) => {
    const search = req.query.search ? String(req.query.search) : undefined;
    const templates = await templateService.list(search);
    res.json(ok(templates));
  }),

  // GET /api/mailmerge/templates/:templateId
  getOne: asyncHandler(async (req: Request, res: Response) => {
    const template = await templateService.requireById(req.params.templateId);
    res.json(ok(template));
  }),

  // POST /api/mailmerge/templates — create a standalone reusable template
  create: asyncHandler(async (req: Request, res: Response) => {
    const dto = createTemplateSchema.parse(req.body);
    const template = await templateService.create(dto);
    res.status(201).json(ok(template));
  }),

  // PUT /api/mailmerge/templates/:templateId
  update: asyncHandler(async (req: Request, res: Response) => {
    const dto = templateInputSchema.parse(req.body);
    const template = await templateService.update(req.params.templateId, dto);
    res.json(ok(template));
  }),

  // POST /api/mailmerge/templates/:templateId/duplicate
  duplicate: asyncHandler(async (req: Request, res: Response) => {
    const template = await templateService.duplicate(req.params.templateId);
    res.status(201).json(ok(template));
  }),

  // DELETE /api/mailmerge/templates/:templateId
  remove: asyncHandler(async (req: Request, res: Response) => {
    await templateService.remove(req.params.templateId);
    res.json(ok({ removed: true }));
  }),
};