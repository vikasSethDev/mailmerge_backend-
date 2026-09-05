import fs from 'fs/promises';
import path from 'path';
import { googleAuthService } from '../services/googleAuth.service';
import { logger } from '../config/logger';
import { ApiError } from '../utils/asyncHandler.util';

export interface GmailSendInput {
  ownerEmail: string;
  fromName: string;
  fromEmail: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
}

export interface GmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function header(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim();
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function buildRawMessage(input: GmailSendInput): Promise<string> {
  const mixedBoundary = `=_MailMerge_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const alternativeBoundary = `=_Alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const lines: string[] = [
    `From: ${header(input.fromName)} <${header(input.fromEmail)}>`,
    `To: ${header(input.to)}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.map(header).join(', ')}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.map(header).join(', ')}`] : []),
    `Subject: ${header(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlToPlainText(input.html),
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    '',
    `--${alternativeBoundary}--`,
  ];

  for (const attachment of input.attachments ?? []) {
    const data = await fs.readFile(path.resolve(attachment.path));
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: application/octet-stream; name="${header(attachment.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${header(attachment.filename)}"`,
      '',
      data.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '',
      '',
    );
  }
  lines.push(`--${mixedBoundary}--`, '');
  return lines.join('\r\n');
}


export interface GmailListMessageInput {
  ownerEmail: string;
  label: 'INBOX' | 'SENT';
  pageToken?: string;
  maxResults?: number;
  query?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  unread: boolean;
  labels: string[];
}

export interface GmailMessageDetail extends GmailMessageSummary {
  cc: string;
  body: string;
  bodyHtml?: string;
}

function decodeBase64Url(value?: string): string {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getHeader(payload: any, name: string): string {
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  return String(headers.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? '');
}

function extractBodies(payload: any): { text: string; html: string } {
  if (!payload) return { text: '', html: '' };
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    const mime = String(payload.mimeType ?? '').toLowerCase();
    if (mime.includes('text/html')) return { text: '', html: decoded };
    return { text: decoded, html: '' };
  }
  let text = '';
  let html = '';
  for (const part of payload.parts ?? []) {
    const child = extractBodies(part);
    if (!text && child.text) text = child.text;
    if (!html && child.html) html = child.html;
  }
  return { text, html };
}

class GmailProvider {
  async verify(email: string): Promise<boolean> {
    try {
      await googleAuthService.getAccessToken(email);
      return true;
    } catch (err) {
      logger.error('Gmail OAuth verify failed: %o', err);
      return false;
    }
  }

  async send(input: GmailSendInput): Promise<GmailSendResult> {
    const ownerEmail = input.ownerEmail.toLowerCase();
    const fromEmail = input.fromEmail.toLowerCase();
    if (ownerEmail !== fromEmail) {
      throw new ApiError(400, `The From email must match the connected Gmail account (${ownerEmail}).`);
    }

    const accessToken = await googleAuthService.getAccessToken(ownerEmail);
    const raw = await buildRawMessage(input);
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: b64url(raw) }),
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data?.error?.message ?? `Gmail API returned HTTP ${response.status}`;
      const err = new Error(reason) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return { messageId: data.id, accepted: [input.to], rejected: [] };
  }

  async listMessages(input: GmailListMessageInput): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string; resultSizeEstimate?: number }> {
    const accessToken = await googleAuthService.getAccessToken(input.ownerEmail);
    const params = new URLSearchParams({
      userId: 'me',
      labelIds: input.label,
      maxResults: String(Math.min(Math.max(input.maxResults ?? 25, 1), 100)),
    });
    if (input.pageToken) params.set('pageToken', input.pageToken);
    if (input.query?.trim()) params.set('q', input.query.trim());
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await response.json();
    if (!response.ok) {
      if (response.status === 403) throw new ApiError(403, 'Gmail read access is not authorized. Reconnect Gmail and allow mail access.');
      throw new ApiError(response.status, `Unable to load Gmail messages: ${data?.error?.message ?? 'Gmail API error'}`);
    }

    const ids = (data.messages ?? []).map((m: any) => String(m.id)).filter(Boolean);
    const summaries = await Promise.all(ids.map((id: string) => this.getMessage(input.ownerEmail, id)));
    return {
      messages: summaries,
      nextPageToken: data.nextPageToken,
      resultSizeEstimate: data.resultSizeEstimate,
    };
  }

  async getMessage(ownerEmail: string, messageId: string): Promise<GmailMessageDetail> {
    const accessToken = await googleAuthService.getAccessToken(ownerEmail);
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await response.json();
    if (!response.ok) {
      if (response.status === 403) throw new ApiError(403, 'Gmail read access is not authorized. Reconnect Gmail and allow mail access.');
      throw new ApiError(response.status, `Unable to load Gmail message: ${data?.error?.message ?? 'Gmail API error'}`);
    }
    const bodies = extractBodies(data.payload);
    return {
      id: String(data.id),
      threadId: data.threadId,
      subject: getHeader(data.payload, 'Subject') || '(No subject)',
      from: getHeader(data.payload, 'From'),
      to: getHeader(data.payload, 'To'),
      cc: getHeader(data.payload, 'Cc'),
      date: getHeader(data.payload, 'Date'),
      snippet: String(data.snippet ?? ''),
      unread: Array.isArray(data.labelIds) && data.labelIds.includes('UNREAD'),
      labels: Array.isArray(data.labelIds) ? data.labelIds : [],
      body: bodies.text || bodies.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      bodyHtml: bodies.html || undefined,
    };
  }

}

export const gmailProvider = new GmailProvider();
