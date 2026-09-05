import { gmailProvider, GmailSendResult } from '../providers/gmail.provider';
import { logger } from '../config/logger';

export interface SendPersonalizedEmailInput {
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

class MailSenderService {
  async sendPersonalized(input: SendPersonalizedEmailInput): Promise<GmailSendResult> {
    logger.info('Sending Gmail API email to %s | account=%s | subject="%s"', input.to, input.ownerEmail, input.subject);
    return gmailProvider.send(input);
  }

  async sendTest(input: Omit<SendPersonalizedEmailInput, 'to'> & { testEmail: string }): Promise<GmailSendResult> {
    const { testEmail, ...rest } = input;
    return this.sendPersonalized({ ...rest, to: testEmail, subject: `[TEST] ${rest.subject}` });
  }
}

export const mailSenderService = new MailSenderService();
