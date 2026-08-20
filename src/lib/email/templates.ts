// @polsia:user-owned — your email templates. Edit, add, or delete freely.
// Each template returns { subject, html, text }; send it via the framework transport:
//   import { sendEmail } from '@/lib/email/send';
//   import { welcomeEmail } from '@/lib/email/templates';
//   await sendEmail({ to: user.email, ...welcomeEmail({ name: user.name }) });
// renderEmail() is a plain inline-styled shell — email clients drop <style>/<link>, so style inline.
// renderEmail() auto-escapes its heading/body/cta/footer, so pass RAW values (don't escapeHtml() them
// first — that double-escapes). escapeHtml() is only for when you hand-build an html string yourself.

/** Subject + rendered bodies — spread into sendEmail({ to, ... }). */
export interface EmailContent {
  subject: string;
  html: string;
  text?: string;
}

export interface RenderEmailOptions {
  heading: string;
  /** Body paragraphs (plain text; escaped for you). */
  body: string[];
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Optional footer line under the divider. */
  footer?: string;
}

/** Escape a value for safe interpolation into an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Wrap content in a minimal, inline-styled email shell. Restyle to match the brand. */
export function renderEmail(options: RenderEmailOptions): { html: string; text: string } {
  const paragraphs = options.body
    .map(
      (line) =>
        `<p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`,
    )
    .join('');
  const button = options.cta
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(options.cta.url)}" style="display:inline-block;padding:10px 20px;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;">${escapeHtml(options.cta.label)}</a></p>`
    : '';
  const footer = options.footer
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;color:#999999;font-size:12px;">${escapeHtml(options.footer)}</div>`
    : '';
  const html = [
    '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">',
    `<h1 style="margin:0 0 16px;color:#111111;font-size:22px;">${escapeHtml(options.heading)}</h1>`,
    paragraphs,
    button,
    footer,
    '</div>',
  ].join('');
  const text = [
    options.heading,
    '',
    ...options.body,
    ...(options.cta ? ['', `${options.cta.label}: ${options.cta.url}`] : []),
    ...(options.footer ? ['', options.footer] : []),
  ].join('\n');
  return { html, text };
}

// ─── Example templates — edit / add / remove to fit the app ───

/** Welcome email for a new signup. */
export function welcomeEmail(input: { name: string; ctaUrl?: string }): EmailContent {
  const { html, text } = renderEmail({
    heading: `Welcome, ${input.name}!`,
    body: ["Thanks for signing up — we're glad you're here."],
    cta: input.ctaUrl ? { label: 'Get started', url: input.ctaUrl } : undefined,
    footer: 'You received this because you created an account.',
  });
  return { subject: 'Welcome aboard', html, text };
}

/** Generic notification email. */
export function notificationEmail(input: {
  subject: string;
  title: string;
  lines: string[];
  cta?: { label: string; url: string };
}): EmailContent {
  const { html, text } = renderEmail({ heading: input.title, body: input.lines, cta: input.cta });
  return { subject: input.subject, html, text };
}

/** Confirmation email sent to the host after they post an event via POST /api/events. */
export function eventCreatedEmail(input: {
  hostName: string;
  eventTitle: string;
  city: string;
  startTime: Date;
  ctaUrl?: string;
}): EmailContent {
  const ctaUrl = input.ctaUrl ?? '/events';
  const start = input.startTime instanceof Date ? input.startTime : new Date(input.startTime);
  const { html, text } = renderEmail({
    heading: `Your event is live, ${input.hostName}!`,
    body: [
      `Your event "${input.eventTitle}" is posted on Heart Lines.`,
      `Starts ${start.toUTCString()} in ${input.city}.`,
    ],
    cta: { label: 'View events', url: ctaUrl },
    footer: 'You received this because you posted an event on Heart Lines.',
  });
  return { subject: 'Your event is live', html, text };
}

/** Confirmation email sent after a visitor joins the waitlist on the landing page. */
export function waitlistConfirmation(input: {
  name?: string;
  /** URL to the landing page; shown as the optional CTA. */
  ctaUrl?: string;
}): EmailContent {
  const ctaUrl = input.ctaUrl ?? '/';
  const { html, text } = renderEmail({
    heading: `You are on the list, ${input.name ?? 'friend'}!`,
    body: [
      'Thanks for signing up for Heart Lines — we will be in touch as soon as we open sign-ups in your area.',
      'In the meantime, feel free to revisit the landing page for the latest updates.',
    ],
    cta: { label: 'Visit Heart Lines', url: ctaUrl },
    footer: 'You received this because you signed up on heart-lines.',
  });
  return { subject: 'You are on the Heart Lines waitlist', html, text };
}

/** Notify the recipient that someone has invited them to a video session. */
export function videoSessionRequest(input: {
  senderName: string;
  recipientName: string;
  sessionUrl: string; // ends in /video-sessions
}): EmailContent {
  const { html, text } = renderEmail({
    heading: `${input.senderName} invited you to a video session`,
    body: [
      `${input.senderName} just sent you a video session request.`,
      'Open your inbox to accept or decline.',
    ],
    cta: { label: 'View request', url: input.sessionUrl },
    footer: 'You received this because someone invited you to a video date.',
  });
  return { subject: `${input.senderName} wants to video chat`, html, text };
}
