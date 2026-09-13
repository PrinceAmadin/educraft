import { emailConfigured, sendEmail, templates, ADMIN_EMAIL } from "@/lib/ambassador-panel/email";
import { referralUrl } from "@/lib/ambassador-panel/links";
import { redisConfigured, withRedis, type RedisClient } from "@/lib/ambassador-panel/redis";
import { readRoster, rosterSchema, writeRoster } from "@/lib/ambassador-panel/roster";
import { SEED_ROSTER } from "@/lib/ambassador-panel/seed-roster";
import type {
  PanelApplication,
  PanelOverview,
  PaymentRecord,
  PendingRegistration,
  Roster,
  TrackingStat,
} from "@/lib/ambassador-panel/types";

/**
 * Ambassador panel actions — a port of the original `api/admin.ts` router.
 *
 * Same Redis keys, same rules, same emails. What changed:
 *   - authentication is the HQ session (see the route), not a shared password
 *   - the roster lives in Redis, so approving an application stamps the slot
 *     immediately instead of waiting for a "Deploy to GitHub"
 *   - `overview` reads everything the panel shows in one connection
 */

export class PanelError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export type Body = Record<string, unknown>;

const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readList<T>(client: RedisClient, setKey: string, prefix: string): Promise<T[]> {
  const ids = await client.sMembers(setKey);
  if (ids.length === 0) return [];
  const raws = await Promise.all(ids.map((id) => client.get(`${prefix}${id}`)));
  return raws.map((r) => parse<T>(r)).filter((x): x is T => x != null);
}

// ── Reads ─────────────────────────────────────────────────────────────────

async function readStats(client: RedisClient): Promise<Record<string, TrackingStat>> {
  const ids = await client.sMembers("ambassador_ids");
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [clicks, orders, profileRaw] = await Promise.all([
        client.get(`clicks:${id}`),
        client.get(`orders:${id}`),
        client.get(`profile:${id}`),
      ]);
      const profile = parse<{ email?: string; name?: string }>(profileRaw);
      return [
        id,
        {
          clicks: parseInt(clicks ?? "0", 10) || 0,
          orders: parseInt(orders ?? "0", 10) || 0,
          email: profile?.email ?? null,
          registeredName: profile?.name ?? null,
        },
      ] as const;
    })
  );
  return Object.fromEntries(rows);
}

async function readPending(client: RedisClient) {
  const list = await readList<PendingRegistration>(client, "pending_ids", "pending:");
  return list.sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
}

async function readApplications(client: RedisClient) {
  const list = await readList<PanelApplication>(client, "application_ids", "application:");
  return list.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
}

async function readPayments(client: RedisClient) {
  const list = await readList<PaymentRecord>(client, "payment_ids", "payment:");
  return list.sort((a, b) => parseInt(a.slotId, 10) - parseInt(b.slotId, 10));
}

/**
 * The roster with approved profiles folded into vacant or unnamed slots —
 * what the original dashboard's "sync" did on load, so an ambassador approved
 * on either deployment shows up here. Not persisted until the next save.
 */
async function readSyncedRoster(client: RedisClient): Promise<Roster> {
  const roster = await readRoster(client);
  const approved = (await client.sMembers("approved_ids")).filter((id) => /^\d+$/.test(id));
  if (approved.length === 0) return roster;
  const profiles = await Promise.all(approved.map((id) => client.get(`profile:${id}`)));
  approved.forEach((rawId, i) => {
    const profile = parse<{ name?: string; school?: string }>(profiles[i]);
    if (!profile?.name) return;
    const id = rawId.padStart(3, "0");
    const existing = roster.slots[id];
    if (!existing || existing.status === "vacant" || !existing.name) {
      roster.slots[id] = { name: profile.name, school: profile.school || existing?.school || "", status: "active" };
    }
  });
  return roster;
}

export async function overview(): Promise<PanelOverview> {
  const status = { redis: redisConfigured(), email: emailConfigured() };
  if (!status.redis) {
    return { status, roster: structuredClone(SEED_ROSTER), stats: {}, pending: [], applications: [], payments: [] };
  }
  return withRedis(async (client) => {
    const roster = await readSyncedRoster(client);
    const [stats, pending, applications, payments] = await Promise.all([
      readStats(client),
      readPending(client),
      readApplications(client),
      readPayments(client),
    ]);
    return { status, roster, stats, pending, applications, payments };
  });
}

// ── Writes ────────────────────────────────────────────────────────────────

async function saveRoster(body: Body) {
  const parsed = rosterSchema.safeParse(body.roster);
  if (!parsed.success) {
    throw new PanelError(400, parsed.error.issues[0]?.message ?? "The roster is not valid.");
  }
  return withRedis(async (client) => ({ roster: await writeRoster(client, parsed.data) }));
}

async function trackOrder(body: Body) {
  const slotId = text(body.slotId).trim();
  const jobDesc = text(body.jobDesc).trim();
  const jobAmount = text(body.jobAmount);
  const commissionPercent = text(body.commissionPercent) || "10";
  if (!slotId) throw new PanelError(400, "slotId is required.");
  const id = slotId.toUpperCase();

  const profileRaw = await withRedis(async (client) => {
    const record = JSON.stringify({ timestamp: new Date().toISOString(), jobDesc, jobAmount, commissionPercent });
    await client.multi().incr(`orders:${id}`).lPush(`orders:${id}:log`, record).sAdd("ambassador_ids", id).exec();
    return client.get(`profile:${id}`);
  });

  let emailSent = false;
  let emailTo = "";
  let emailReason = "no_profile";
  const profile = parse<{ name: string; email: string }>(profileRaw);
  if (profile) {
    emailTo = profile.email ?? "";
    if (!emailTo) emailReason = "no_email";
    else if (!emailConfigured()) emailReason = "no_gmail_password";
    else {
      const amount = parseFloat(jobAmount.replace(/,/g, "")) || 0;
      const pct = parseFloat(commissionPercent) || 10;
      const commission = amount > 0 ? amount * (pct / 100) : 0;
      emailSent = (
        await sendEmail(emailTo, "EduCraft — Commission Notification", templates.commission(profile.name, jobDesc, amount, pct, commission))
      ).ok;
      emailReason = emailSent ? "sent" : "send_failed";
    }
  }
  return { success: true, emailSent, emailTo, emailReason };
}

async function decidePending(body: Body, origin: string) {
  const slotId = text(body.slotId);
  const decision = text(body.decision) || text(body.action) || "approve";
  const reason = text(body.reason);
  if (!slotId) throw new PanelError(400, "slotId required.");
  const id = slotId.trim().toUpperCase();

  const profile = await withRedis(async (client) => {
    const raw = await client.get(`pending:${id}`);
    const p = parse<PendingRegistration>(raw);
    if (!p) throw new PanelError(404, "No pending registration found.");
    if (decision === "approve") {
      await client
        .multi()
        .set(`profile:${id}`, JSON.stringify(p))
        .del(`pending:${id}`)
        .sRem("pending_ids", id)
        .sAdd("approved_ids", id)
        .sAdd("ambassador_ids", id)
        .exec();
    } else {
      await client.multi().del(`pending:${id}`).sRem("pending_ids", id).exec();
    }
    return p;
  });

  if (decision === "approve") {
    const link = referralUrl(origin, id);
    const emailSent = (await sendEmail(profile.email, "EduCraft — Your Ambassador Account is Now Active", templates.welcome(profile.name, id, link))).ok;
    return { success: true, action: "approved", name: profile.name, email: profile.email, emailSent };
  }
  const emailSent = (await sendEmail(profile.email, "EduCraft — Ambassador Registration Update", templates.rejectRegistration(profile.name, id, reason))).ok;
  return { success: true, action: "rejected", emailSent };
}

async function editPending(body: Body) {
  const originalSlotId = text(body.originalSlotId);
  const slotId = text(body.slotId);
  const name = text(body.name);
  const school = text(body.school);
  const email = text(body.email);
  const changeReason = text(body.changeReason);
  if (!originalSlotId || !slotId || !name || !email) {
    throw new PanelError(400, "Slot ID, name and email are required.");
  }
  const origId = originalSlotId.trim().toUpperCase();
  const newId = slotId.trim().toUpperCase();

  return withRedis(async (client) => {
    const existing = parse<Record<string, unknown>>(await client.get(`pending:${origId}`));
    if (!existing) throw new PanelError(404, "No pending registration found.");
    const updated = {
      ...existing,
      slotId: newId,
      name: name.trim(),
      school: school.trim(),
      email: email.trim().toLowerCase(),
      adminCorrected: true,
      changeReason: changeReason || "Corrected by admin.",
      correctedAt: new Date().toISOString(),
    };
    if (origId !== newId) {
      const [inPending, inApproved] = await Promise.all([
        client.sIsMember("pending_ids", newId),
        client.sIsMember("approved_ids", newId),
      ]);
      if (inPending || inApproved) throw new PanelError(409, `Slot ${newId} is already in use.`);
      await client
        .multi()
        .del(`pending:${origId}`)
        .sRem("pending_ids", origId)
        .set(`pending:${newId}`, JSON.stringify(updated))
        .sAdd("pending_ids", newId)
        .exec();
    } else {
      await client.set(`pending:${origId}`, JSON.stringify(updated));
    }
    return { success: true, updatedProfile: updated };
  });
}

/** Clear an application's duplicate-detection locks inside an open transaction. */
function clearApplicationLocks(tx: ReturnType<RedisClient["multi"]>, appRaw: string | null) {
  const app = parse<Record<string, string>>(appRaw);
  if (!app) return;
  const normName = (app.fullName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  tx.sRem("app_emails", app.email ?? "")
    .sRem("app_phones", (app.phone ?? "").replace(/\D/g, ""))
    .sRem("app_banks", (app.accountNumber ?? "").replace(/\D/g, ""))
    .del(`app_name:${normName}`);
}

async function resetSlot(body: Body) {
  const slotId = text(body.slotId).trim();
  if (!slotId) throw new PanelError(400, "slotId is required.");
  const id = slotId.padStart(3, "0").toUpperCase();

  await withRedis(async (client) => {
    const [appRaw, pendingRaw] = await Promise.all([client.get(`application:${id}`), client.get(`pending:${id}`)]);
    const tx = client
      .multi()
      .del(`profile:${id}`)
      .del(`pending:${id}`)
      .del(`clicks:${id}`)
      .del(`orders:${id}`)
      .del(`orders:${id}:log`)
      .del(`payment:${id}`)
      .del(`application:${id}`)
      .sRem("approved_ids", id)
      .sRem("pending_ids", id)
      .sRem("ambassador_ids", id)
      .sRem("application_ids", id)
      .sRem("approved_application_ids", id)
      .sRem("payment_ids", id);
    clearApplicationLocks(tx, appRaw);
    const pending = parse<{ email?: string }>(pendingRaw);
    if (pending?.email) tx.sRem("app_emails", pending.email.trim().toLowerCase());
    await tx.exec();
  });
  return { success: true, message: `Slot ${id} fully reset. All data and duplicate locks cleared.` };
}

async function clearAmbassador(body: Body) {
  const slotId = text(body.slotId).trim();
  if (!slotId) throw new PanelError(400, "slotId is required.");
  const id = /^EC[CS]A-/i.test(slotId) ? slotId.toUpperCase() : slotId.padStart(3, "0");

  await withRedis(async (client) => {
    const appRaw = await client.get(`application:${id}`);
    const tx = client
      .multi()
      .del(`profile:${id}`)
      .del(`payment:${id}`)
      .del(`application:${id}`)
      .sRem("approved_ids", id)
      .sRem("ambassador_ids", id)
      .sRem("payment_ids", id)
      .sRem("application_ids", id)
      .sRem("approved_application_ids", id);
    clearApplicationLocks(tx, appRaw);
    await tx.exec();
  });
  return { success: true, message: `Slot ${id} cleared. Details and duplicate locks removed.` };
}

async function broadcast(body: Body) {
  const subject = text(body.subject).trim();
  const message = text(body.message).trim();
  if (!subject) throw new PanelError(400, "Subject is required.");
  if (!message) throw new PanelError(400, "Message is required.");
  if (!emailConfigured()) throw new PanelError(503, "Email is not configured — add GMAIL_APP_PASSWORD.");

  const emails = await withRedis(async (client) => {
    const ids = await client.sMembers("approved_ids");
    const raws = await Promise.all(ids.map((id) => client.get(`profile:${id}`)));
    return raws
      .map((r) => parse<{ email?: string }>(r)?.email)
      .filter((e): e is string => Boolean(e && e.includes("@")));
  });

  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    const { ok } = await sendEmail(email, subject, templates.broadcast(subject, message));
    if (ok) sent++;
    else failed++;
  }
  return { success: true, sent, failed, total: emails.length };
}

async function messageAmbassador(body: Body) {
  const slotId = text(body.slotId);
  const title = text(body.title).trim();
  const message = text(body.message).trim();
  if (!slotId || !title || !message) throw new PanelError(400, "Slot, title and message are required.");
  if (!emailConfigured()) throw new PanelError(503, "Email is not configured — add GMAIL_APP_PASSWORD.");
  const id = slotId.trim().toUpperCase();

  const profile = await withRedis(async (client) => parse<{ name: string; email: string }>(await client.get(`profile:${id}`)));
  if (!profile) throw new PanelError(404, "This ambassador has not registered their email yet.");
  if (!profile.email) throw new PanelError(404, "No email found for this ambassador.");
  const { ok, error } = await sendEmail(profile.email, title, templates.message(profile.name, title, message));
  if (!ok) throw new PanelError(502, error ?? "The email could not be sent.");
  return { success: true, sentTo: profile.email, name: profile.name };
}

async function testEmail() {
  const result = await sendEmail(ADMIN_EMAIL, "EduCraft — Email Test Successful", templates.test());
  if (!result.ok) throw new PanelError(500, result.error ?? "The test email failed.");
  return { success: true, message: `Test email sent to ${ADMIN_EMAIL}` };
}

async function approveApplication(body: Body, origin: string) {
  const slotId = text(body.slotId);
  if (!slotId) throw new PanelError(400, "slotId required.");
  const id = slotId.trim().padStart(3, "0");

  const result = await withRedis(async (client) => {
    const app = parse<Record<string, string>>(await client.get(`application:${id}`));
    if (!app) throw new PanelError(404, "Application not found.");
    const finalName = text(body.fullName).trim() || app.fullName;
    const finalAbbr = text(body.universityAbbr).trim() || app.universityAbbr;
    const finalEmail = text(body.email).trim() || app.email;
    const now = new Date().toISOString();

    const profile = { slotId: id, name: finalName, school: finalAbbr, email: finalEmail, registeredAt: now };
    const payment = {
      slotId: id,
      name: finalName,
      bankName: app.bankName,
      accountNumber: app.accountNumber,
      accountName: app.accountName,
      email: finalEmail,
      phone: app.phone,
      universityFull: app.universityFull,
      universityAbbr: finalAbbr,
      approvedAt: now,
    };
    await client
      .multi()
      .set(`profile:${id}`, JSON.stringify(profile))
      .sAdd("approved_ids", id)
      .sAdd("ambassador_ids", id)
      .set(`payment:${id}`, JSON.stringify(payment))
      .sAdd("payment_ids", id)
      .set(`application:${id}`, JSON.stringify({ ...app, status: "approved", approvedAt: now, finalName, finalEmail, finalAbbr }))
      .sRem("application_ids", id)
      .sAdd("approved_application_ids", id)
      .exec();

    // Stamp the slot active in the roster straight away.
    const roster = await readRoster(client);
    roster.slots[id] = { name: finalName, school: finalAbbr, status: "active" };
    await writeRoster(client, roster);

    return { finalName, finalAbbr, finalEmail };
  });

  const link = referralUrl(origin, id);
  const emailSent = (
    await sendEmail(
      result.finalEmail,
      "Welcome to EduCraft — Your Ambassador Account is Active",
      templates.welcomeApplication(result.finalName, id, link, result.finalAbbr)
    )
  ).ok;
  return { success: true, slotId: id, name: result.finalName, email: result.finalEmail, link, emailSent };
}

async function rejectApplication(body: Body) {
  const slotId = text(body.slotId);
  const reason = text(body.reason);
  if (!slotId) throw new PanelError(400, "slotId required.");
  const id = slotId.trim().padStart(3, "0");

  const app = await withRedis(async (client) => {
    const raw = await client.get(`application:${id}`);
    const a = parse<Record<string, string>>(raw);
    if (!a) throw new PanelError(404, "Application not found.");
    const tx = client.multi().del(`application:${id}`).sRem("application_ids", id);
    clearApplicationLocks(tx, raw);
    await tx.exec();
    return a;
  });

  const emailSent = (await sendEmail(app.email, "EduCraft Ambassador Application — Update", templates.rejectApplication(app.fullName, reason))).ok;
  return { success: true, emailSent };
}

async function saveSub(body: Body) {
  const subId = text(body.subId).trim().toUpperCase();
  const name = text(body.name).trim();
  const school = text(body.school).trim();
  const coreId = text(body.coreId).trim().toUpperCase();
  if (!subId || !name || !coreId) throw new PanelError(400, "Sub ID, name and core ID are required.");

  return withRedis(async (client) => {
    const roster = await readRoster(client);
    if (!roster.coreAmbassadors.some((c) => c.id === coreId)) {
      throw new PanelError(400, `Core Ambassador ${coreId} does not exist. Add them first.`);
    }
    if (roster.subAmbassadors.some((s) => s.id === subId)) throw new PanelError(409, `${subId} already exists.`);

    // The redirect reads this profile so the link works immediately.
    await client.set(`sub_profile:${subId}`, JSON.stringify({ id: subId, name, school, coreId, createdAt: new Date().toISOString() }));
    await client.sAdd("sub_ids", subId);

    roster.subAmbassadors.push({ id: subId, name, school, percentage: 7, coreId, status: "active" });
    return { success: true, subId, roster: await writeRoster(client, roster) };
  });
}

async function paymentRecords() {
  return withRedis(readPayments);
}

async function savePayment(body: Body) {
  const slotId = text(body.slotId).trim();
  if (!slotId) throw new PanelError(400, "Slot ID is required.");
  const id = slotId.padStart(3, "0");
  const fields = ["bankName", "accountNumber", "accountName", "email", "phone", "universityFull", "universityAbbr"] as const;

  return withRedis(async (client) => {
    const prev = parse<Record<string, string>>(await client.get(`payment:${id}`)) ?? {};
    const updated: Record<string, string> = { ...prev, slotId: id, updatedAt: new Date().toISOString() };
    const fullName = text(body.fullName || body.name).trim();
    if (fullName) updated.name = fullName;
    for (const f of fields) {
      const v = text(body[f]).trim();
      if (v) updated[f] = v;
    }
    await client.multi().set(`payment:${id}`, JSON.stringify(updated)).sAdd("payment_ids", id).exec();
    return { success: true, record: updated };
  });
}

/** Public: the slot a new applicant is offered. */
export async function nextOpenSlot() {
  return withRedis(async (client) => {
    const [roster, approved, pending, apps] = await Promise.all([
      readRoster(client),
      client.sMembers("approved_ids"),
      client.sMembers("pending_ids"),
      client.sMembers("application_ids"),
    ]);
    const taken = new Set([...approved, ...pending, ...apps].map((id) => id.padStart(3, "0")));
    const slots = Object.entries(roster.slots).map(([id, s]) => ({ id: id.padStart(3, "0"), status: s.status }));

    const vacant = slots
      .filter((s) => s.status === "vacant" && !taken.has(s.id))
      .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
    if (vacant.length > 0) return { slotId: vacant[0].id, fromVacant: true };

    const existing = slots.map((s) => parseInt(s.id, 10)).filter((n) => !Number.isNaN(n) && n > 0);
    const takenNums = new Set([...taken].map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n)));
    let next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    while (takenNums.has(next)) next++;
    return { slotId: String(next).padStart(3, "0"), fromVacant: false };
  });
}

/** Actions that permanently delete tracking data — founder only. */
export const DESTRUCTIVE_ACTIONS = new Set(["reset-slot", "clear-ambassador"]);

export async function runAction(action: string, body: Body, ctx: { origin: string }): Promise<unknown> {
  switch (action) {
    case "overview":
      return overview();
    case "status":
      return { redis: redisConfigured(), email: emailConfigured() };
    case "save-roster":
      return saveRoster(body);
    case "track-order":
      return trackOrder(body);
    case "approve":
      return decidePending(body, ctx.origin);
    case "edit-pending":
      return editPending(body);
    case "reset-slot":
      return resetSlot(body);
    case "clear-ambassador":
      return clearAmbassador(body);
    case "broadcast":
      return broadcast(body);
    case "message-ambassador":
      return messageAmbassador(body);
    case "test-email":
      return testEmail();
    case "approve-application":
      return approveApplication(body, ctx.origin);
    case "reject-application":
      return rejectApplication(body);
    case "save-sub":
      return saveSub(body);
    case "payment-records":
      return paymentRecords();
    case "save-payment":
      return savePayment(body);
    case "get-next-slot":
      return nextOpenSlot();
    default:
      throw new PanelError(400, `Unknown action: "${action}".`);
  }
}
