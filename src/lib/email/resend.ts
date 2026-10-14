import 'server-only';
import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

function requireEnv(name: 'RESEND_API_KEY' | 'EMAIL_FROM'): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for transactional email`);
  }

  return value;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = requireEnv('RESEND_API_KEY');
  const from = requireEnv('EMAIL_FROM');
  const defaultReplyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;
  const replyTo = input.replyTo ?? defaultReplyTo;

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend email send failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Resend email send failed: no message id returned');
  }

  return { id: data.id };
}
