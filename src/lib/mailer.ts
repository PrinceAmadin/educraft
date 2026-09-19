import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email through the EduCraft Gmail account.
 *
 * Needs GMAIL_APP_PASSWORD (a 16-character Google App Password, not the
 * account password). GMAIL_USER defaults to the business inbox. Port 587 with
 * STARTTLS — more reliable from serverless hosts than 465.
 */

const DEFAULT_SENDER = "educraft611@gmail.com";

function credentials() {
  const user = process.env.GMAIL_USER?.trim() || DEFAULT_SENDER;
  // App passwords are often copied with spaces between the four groups.
  const pass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");
  return { user, pass };
}

export function mailerConfigured(): boolean {
  return credentials().pass.length === 16;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const { user, pass } = credentials();
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

export interface MailResult {
  ok: boolean;
  error?: string;
}

export async function sendMail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe for the weekly summary. */
  headers?: Record<string, string>;
}): Promise<MailResult> {
  if (!mailerConfigured()) {
    return { ok: false, error: "Email isn't set up — GMAIL_APP_PASSWORD is missing or not 16 characters." };
  }
  try {
    await getTransporter().sendMail({
      from: `"EduCraft" <${credentials().user}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.headers ? { headers: message.headers } : {}),
    });
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[mailer] send failed:", reason);
    return { ok: false, error: reason };
  }
}

/** Escape user-supplied text before it goes into an HTML email. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
