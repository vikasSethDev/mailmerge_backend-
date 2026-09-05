import { IContact } from '../models/Contact.model';
import { IAttachment } from '../models/Attachment.model';
import { renderTemplate, splitEmailList, listUnresolvedVariables } from '../utils/templateEngine.util';
import { attachmentService } from './attachment.service';
import { AttachmentMode } from '../models/Campaign.model';

export interface PreviewTemplateInput {
  fromName: string;
  fromEmail: string;
  toTemplate?: string;
  ccTemplate?: string;
  bccTemplate?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
}

export interface RenderedEmail {
  from: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  attachments: { fileName: string; path?: string; resolved: boolean }[];
  unresolvedVariables: string[];
}

export interface AttachmentResolutionInput {
  attachmentMode: AttachmentMode;
  sameAttachmentIds?: string[];
  attachmentCsvColumn?: string;
}

class PreviewService {
  render(template: PreviewTemplateInput, contact: IContact): Omit<RenderedEmail, 'attachments'> {
    const fields = { ...contact.fields, email: contact.email };

    const to = renderTemplate(template.toTemplate ?? '{{email}}', fields) || contact.email;
    const cc = splitEmailList(renderTemplate(template.ccTemplate ?? '', fields));
    const bcc = splitEmailList(renderTemplate(template.bccTemplate ?? '', fields));
    const subject = renderTemplate(template.subjectTemplate, fields);
    const html = renderTemplate(template.bodyHtmlTemplate, fields);

    const unresolvedVariables = Array.from(
      new Set([
        ...listUnresolvedVariables(subject),
        ...listUnresolvedVariables(html),
      ]),
    );

    return {
      from: `${template.fromName} <${template.fromEmail}>`,
      to,
      cc,
      bcc,
      subject,
      html,
      unresolvedVariables,
    };
  }

  async resolveAttachments(
    contact: IContact,
    options: AttachmentResolutionInput,
  ): Promise<{ fileName: string; path?: string; attachmentId?: string; resolved: boolean }[]> {
    if (options.attachmentMode === 'none') return [];

    if (options.attachmentMode === 'same-for-all') {
      const attachments = await attachmentService.getByIds(options.sameAttachmentIds ?? []);
      return attachments.map((a: IAttachment) => ({
        fileName: a.originalName,
        path: a.path,
        attachmentId: String(a._id),
        resolved: true,
      }));
    }

    // per-recipient-csv-column
    const column = options.attachmentCsvColumn;
    const fileName = column ? contact.fields[column] : undefined;
    if (!fileName) {
      return [{ fileName: '(missing)', resolved: false }];
    }
    const attachment = await attachmentService.resolveByOriginalName(fileName);
    if (!attachment) {
      return [{ fileName, resolved: false }];
    }
    return [{ fileName: attachment.originalName, path: attachment.path, attachmentId: String(attachment._id), resolved: true }];
  }

  async renderFull(template: PreviewTemplateInput, contact: IContact, attachmentOptions: AttachmentResolutionInput): Promise<RenderedEmail> {
    const base = this.render(template, contact);
    const attachments = await this.resolveAttachments(contact, attachmentOptions);
    return { ...base, attachments };
  }
}

export const previewService = new PreviewService();
