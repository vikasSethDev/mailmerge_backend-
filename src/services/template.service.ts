import { EmailTemplateModel, IEmailTemplate } from '../models/EmailTemplate.model';
import { extractVariables } from '../utils/templateEngine.util';
import { ApiError } from '../utils/asyncHandler.util';
import { Types } from 'mongoose';

export interface TemplateInput {
  name?: string;
  fromName: string;
  fromEmail: string;
  toTemplate?: string;
  ccTemplate?: string;
  bccTemplate?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
}

class TemplateService {
  async create(input: TemplateInput): Promise<IEmailTemplate> {
    const variablesUsed = Array.from(
      new Set([
        ...extractVariables(input.subjectTemplate),
        ...extractVariables(input.bodyHtmlTemplate),
        ...extractVariables(input.toTemplate ?? ''),
        ...extractVariables(input.ccTemplate ?? ''),
        ...extractVariables(input.bccTemplate ?? ''),
      ]),
    );

    return EmailTemplateModel.create({
      name: input.name ?? 'Untitled template',
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      toTemplate: input.toTemplate ?? '{{email}}',
      ccTemplate: input.ccTemplate,
      bccTemplate: input.bccTemplate,
      subjectTemplate: input.subjectTemplate,
      bodyHtmlTemplate: input.bodyHtmlTemplate,
      variablesUsed,
    });
  }

  async getById(id: string): Promise<IEmailTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return EmailTemplateModel.findById(id);
  }

  /** Powers the Templates library page: newest-first, optional name search. */
  async list(search?: string): Promise<IEmailTemplate[]> {
    const filter: Record<string, unknown> = {};
    if (search && search.trim().length > 0) {
      filter.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    return EmailTemplateModel.find(filter).sort({ updatedAt: -1 });
  }

  async requireById(id: string): Promise<IEmailTemplate> {
    const template = await this.getById(id);
    if (!template) throw new ApiError(404, 'Template not found');
    return template;
  }

  async update(id: string, input: Partial<TemplateInput>): Promise<IEmailTemplate> {
    const template = await this.requireById(id);

    if (input.name !== undefined) template.name = input.name;
    if (input.fromName !== undefined) template.fromName = input.fromName;
    if (input.fromEmail !== undefined) template.fromEmail = input.fromEmail;
    if (input.toTemplate !== undefined) template.toTemplate = input.toTemplate;
    if (input.ccTemplate !== undefined) template.ccTemplate = input.ccTemplate;
    if (input.bccTemplate !== undefined) template.bccTemplate = input.bccTemplate;
    if (input.subjectTemplate !== undefined) template.subjectTemplate = input.subjectTemplate;
    if (input.bodyHtmlTemplate !== undefined) template.bodyHtmlTemplate = input.bodyHtmlTemplate;

    template.variablesUsed = Array.from(
      new Set([
        ...extractVariables(template.subjectTemplate),
        ...extractVariables(template.bodyHtmlTemplate),
        ...extractVariables(template.toTemplate ?? ''),
        ...extractVariables(template.ccTemplate ?? ''),
        ...extractVariables(template.bccTemplate ?? ''),
      ]),
    );

    await template.save();
    return template;
  }

  async duplicate(id: string): Promise<IEmailTemplate> {
    const template = await this.requireById(id);
    return EmailTemplateModel.create({
      name: `${template.name} (copy)`,
      fromName: template.fromName,
      fromEmail: template.fromEmail,
      toTemplate: template.toTemplate,
      ccTemplate: template.ccTemplate,
      bccTemplate: template.bccTemplate,
      subjectTemplate: template.subjectTemplate,
      bodyHtmlTemplate: template.bodyHtmlTemplate,
      variablesUsed: template.variablesUsed,
    });
  }

  async remove(id: string): Promise<void> {
    await this.requireById(id);
    await EmailTemplateModel.findByIdAndDelete(id);
  }
}

export const templateService = new TemplateService();