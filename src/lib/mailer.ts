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

export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Enough to catch typos like "gmail..com" before Gmail rejects them. */
const PLAUSIBLE_EMAIL = /^[^\s@]+@(?!.*\.\.)[^\s@.][^\s@]*\.[a-z]{2,}$/i;

/**
 * Send many emails over a few reused Gmail connections. `sendMail` logs in
 * afresh for every message (~5 s each), which is fine for one email but made
 * a 34-person broadcast take three minutes. A pool logs in once per
 * connection and sends in parallel; it is closed when the batch is done so no
 * socket outlives the request. Results come back in input order.
 */
export async function sendMailBatch(
  messages: BatchMessage[],
  { connections = 3 }: { connections?: number } = {}
): Promise<MailResult[]> {
  if (!mailerConfigured()) {
    const error = "Email isn't set up — GMAIL_APP_PASSWORD is missing or not 16 characters.";
    return messages.map(() => ({ ok: false, error }));
  }

  const { user, pass } = credentials();
  const pool = nodemailer.createTransport({
    pool: true,
    maxConnections: connections,
    maxMessages: 100,
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    // The pool queues these itself and runs `connections` at a time.
    return await Promise.all(
      messages.map(async (message): Promise<MailResult> => {
        if (!PLAUSIBLE_EMAIL.test(message.to.trim())) {
          return { ok: false, error: "Email address looks mistyped" };
        }
        try {
          await pool.sendMail({
            from: `"EduCraft" <${user}>`,
            to: message.to.trim(),
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.headers ? { headers: message.headers } : {}),
          });
          return { ok: true };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[mailer] batch send to ${message.to} failed:`, reason);
          return { ok: false, error: reason };
        }
      })
    );
  } finally {
    pool.close();
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
