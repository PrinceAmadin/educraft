import nodemailer from "nodemailer";

/**
 * Transactional email for the ambassador panel. SERVER ONLY.
 *
 * Same Gmail account, transport and messages as the original app. One change:
 * every value that came from a form is HTML-escaped before it goes into a
 * template — the original interpolated names and reasons raw.
 */

export const ADMIN_EMAIL = "EduCraft611@gmail.com";

export function emailConfigured(): boolean {
  return Boolean(process.env.GMAIL_APP_PASSWORD);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const rawPass = process.env.GMAIL_APP_PASSWORD;
  if (!rawPass) return { ok: false, error: "GMAIL_APP_PASSWORD is not set." };
  // Google App Passwords are often copied with spaces — strip them.
  const pass = rawPass.replace(/\s/g, "");
  if (pass.length !== 16) {
    return {
      ok: false,
      error: `GMAIL_APP_PASSWORD has ${pass.length} characters after removing spaces — it must be exactly 16.`,
    };
  }
  try {
    // Port 587 + STARTTLS is more reliable on Vercel than 465.
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: ADMIN_EMAIL, pass },
      socketTimeout: 10000,
      connectionTimeout: 8000,
    });
    await transport.sendMail({ from: `"EduCraft" <${ADMIN_EMAIL}>`, to, subject, html });
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ambassador-panel] email error:", message);
    return { ok: false, error: message };
  }
}

/** Escape a form value for safe inclusion in an HTML email. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const naira = (n: number) => `&#8358;${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shell = (eyebrow: string, title: string, body: string, footnote = "") =>
  `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #0D9488;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#0D9488;letter-spacing:.1em;margin-bottom:6px">${eyebrow}</div><h1 style="color:#0F172A;font-size:1.3rem;font-weight:700;margin:0 0 20px">${title}</h1>${body}<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EduCraft — Academic &amp; Technical Documentation Experts.${footnote ? ` ${footnote}` : ""}</div></div></div>`;

const para = (html: string) => `<p style="color:#333;line-height:1.7">${html}</p>`;
const panel = (label: string, content: string) =>
  `<div style="background:#f8f9fa;border-left:4px solid #0D9488;border-radius:2px;padding:18px 20px;margin:20px 0"><div style="font-size:.72rem;color:#0D9488;font-weight:700;margin-bottom:8px">${label}</div>${content}</div>`;

export const templates = {
  commission(name: string, jobDesc: string, amount: number, pct: number, commission: number) {
    const job = jobDesc ? panel("Job details", `<div style="color:#333;font-size:.88rem;line-height:1.6">${esc(jobDesc)}</div>`) : "";
    const pay =
      amount > 0
        ? panel(
            "Your commission",
            `<div style="font-size:1.8rem;font-weight:700;color:#0F172A">${naira(commission)}</div><div style="font-size:.82rem;color:#888;margin-top:4px">${pct}% of ${naira(amount)}</div>`
          )
        : panel("Your commission", `<div style="color:#0F172A;font-size:.88rem">Your commission will be confirmed by your EduCraft coordinator.</div>`);
    return shell(
      "EduCraft",
      "Referral commission — new order confirmed",
      `${para(`Dear <strong>${esc(name)}</strong>,`)}${para("A client referred through your EduCraft ambassador link has placed a confirmed order.")}${job}${pay}${para("Keep sharing your referral link to grow your earnings.")}`
    );
  },

  welcome(name: string, slotId: string, link: string) {
    return shell(
      "EduCraft",
      "Ambassador account activated",
      `${para(`Dear <strong>${esc(name)}</strong>,`)}${para("Your registration has been verified and approved. Your referral link is now live.")}${panel(
        "Your referral link",
        `<div style="font-family:monospace;color:#0F172A;font-size:.88rem;word-break:break-all">${esc(link)}</div><div style="font-size:.75rem;color:#aaa;margin-top:4px">Slot ID: ${esc(slotId)}</div>`
      )}${para("Every confirmed order earns you a commission — you will be notified by email each time.")}`
    );
  },

  welcomeApplication(name: string, slotId: string, link: string, school: string) {
    return shell(
      "EduCraft Ambassador Programme",
      `Welcome aboard, ${esc(name)}`,
      `${para(`Your application has been approved. You are now an official EduCraft Ambassador at <strong>${esc(school)}</strong>.`)}${panel(
        "Your referral link",
        `<div style="font-family:monospace;color:#0F172A;font-size:.88rem;word-break:break-all">${esc(link)}</div><div style="font-size:.75rem;color:#aaa;margin-top:4px">Slot ID: EduCraftA-${esc(slotId)}</div>`
      )}<div style="background:#f8f9fa;border-radius:4px;padding:14px 18px;margin-bottom:20px;font-size:.87rem;color:#0F172A;line-height:1.8"><strong>How it works:</strong><br/>1. Share your link with potential clients<br/>2. When they message EduCraft, your name is included automatically<br/>3. When the order is confirmed, you earn 10% commission<br/>4. You will receive an email notification with your earnings</div>`
    );
  },

  rejectRegistration(name: string, slotId: string, reason: string) {
    const r = reason ? `<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:.88rem">${esc(reason)}</div>` : "";
    return shell(
      "EduCraft",
      `Registration update — slot ${esc(slotId)}`,
      `${para(`Dear <strong>${esc(name)}</strong>,`)}${para(`Thank you for applying. After reviewing your registration for slot <strong>${esc(slotId)}</strong>, we were unable to verify the details at this time.`)}${r}${para("If you believe this is an error, please contact us at educraft611@gmail.com or resubmit.")}`
    );
  },

  rejectApplication(name: string, reason: string) {
    const r = reason ? `<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:.88rem">${esc(reason)}</div>` : "";
    return shell(
      "EduCraft",
      "Application update",
      `${para(`Dear <strong>${esc(name)}</strong>,`)}${para("Thank you for applying. After review, we are unable to proceed at this time.")}${r}${para("Please contact your EduCraft coordinator if you have questions.")}`
    );
  },

  broadcast(subject: string, message: string) {
    return shell(
      "EduCraft — Ambassador update",
      esc(subject),
      `<div style="color:#333;line-height:1.8;font-size:.92rem">${esc(message).replace(/\n/g, "<br/>")}</div>`,
      "This message was sent to all active EduCraft Ambassadors."
    );
  },

  message(name: string, title: string, message: string) {
    return shell(
      "EduCraft — Message for you",
      esc(title),
      `${para(`Dear <strong>${esc(name)}</strong>,`)}<div style="color:#333;line-height:1.8;font-size:.92rem">${esc(message).replace(/\n/g, "<br/>")}</div>`,
      "This message was sent directly to you by the EduCraft admin team."
    );
  },

  adminNewRegistration(p: { slotId: string; name: string; school: string; email: string; registeredAt: string }) {
    const date = new Date(p.registeredAt).toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos" });
    return shell(
      "EduCraft — Admin notification",
      "New ambassador registration pending approval",
      `${para("An ambassador has submitted their details. Verify and act from the ambassador panel.")}${panel(
        "Registration",
        `<div style="font-size:.9rem;line-height:1.9;color:#333">Slot ID: <strong style="font-family:monospace">${esc(p.slotId)}</strong><br/>Name: ${esc(p.name)}<br/>School: ${esc(p.school || "— not provided —")}<br/>Email: ${esc(p.email)}<br/>Submitted: ${esc(date)}</div>`
      )}${para("Open the EduCraft HQ ambassador panel → <strong>Tracking</strong> → Approve, Edit or Reject.")}`,
      "Automated admin alert. Do not reply."
    );
  },

  adminNewApplication(a: Record<string, string>) {
    return shell(
      "EduCraft — New ambassador application",
      `Review required — slot ${esc(a.slotId)}`,
      panel(
        "Application",
        `<div style="font-size:.88rem;line-height:1.9;color:#333">Assigned slot: <strong style="font-family:monospace">${esc(a.slotId)}</strong><br/>Full name: ${esc(a.fullName)}<br/>University: ${esc(a.universityFull)} (${esc(a.universityAbbr)})<br/>Email: ${esc(a.email)}<br/>Phone: ${esc(a.phone)}<br/>Bank: ${esc(a.bankName)}<br/>Account no.: <span style="font-family:monospace">${esc(a.accountNumber)}</span><br/>Account name: ${esc(a.accountName)}</div>`
      ) + para("Open the EduCraft HQ ambassador panel → <strong>Applications</strong> → Approve, Edit or Reject."),
      "Automated notification. Do not reply."
    );
  },

  test() {
    return shell(
      "EduCraft",
      "Email is working",
      para(`Environment: <strong>${esc(process.env.VERCEL_ENV ?? "local")}</strong>. Your Gmail App Password is configured correctly.`)
    );
  },
};
