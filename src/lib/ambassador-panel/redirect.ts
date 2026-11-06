import crypto from "crypto";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { redisConfigured, withRedis } from "@/lib/ambassador-panel/redis";
import {
  drainClickRetryQueue,
  readVisitorId,
  recordClick,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/click-tracking/record-click";
import { db } from "@/lib/db";
import { waLink } from "@/lib/whatsapp";
import { getHqContact, HQ_CONTACT_FALLBACK, type HqContact } from "@/lib/services/hq-contact";
import { AMBASSADOR_LINK_MESSAGE_DEFAULTS, getAmbassadorLinkMessages } from "@/lib/services/settings";
import { fillAmbassadorMessage } from "@/lib/ambassador-panel/referral-message";

/**
 * Referral links → WhatsApp, exactly as the original `api/redirect.ts`:
 *
 *   /EduCraftA/{slot}   general ambassador client link
 *   /ECCA/{id}          Core Ambassador recruitment link
 *   /ECSA/{id}          Sub-Ambassador client link
 *
 * Names and slots come from Postgres (`AmbassadorSlot`, edited in Manage);
 * every visit increments `clicks:{id}` in Redis and adds the id to
 * `ambassador_ids`, so the click history already collected carries over.
 *
 * Each visit is also written to Postgres as a `ClickEvent` (geo, device,
 * browser, unique-vs-duplicate quality) for the ambassador analytics. Both
 * writes start the moment the slot is confirmed — BEFORE the contact and
 * message settings are read, so a hiccup there can never cost a click — and
 * are handed to `waitUntil`: the student is redirected immediately and Vercel
 * keeps the function alive until the writes finish. The ClickEvent write
 * retries itself and falls back to a Redis replay queue (see record-click.ts),
 * which this same hand-off drains on later clicks. The settings reads fall
 * back to the shipped defaults, so the redirect keeps working through a
 * database hiccup too.
 *
 * Every response that tracked a click also sets the `ecv` visitor cookie (an
 * anonymous random id), so "same visitor" means "same device" on later clicks
 * instead of guessing from the shared carrier/campus IP address.
 */

export type ReferralKind = "ambassador" | "ecca" | "ecsa";

const wa = waLink;

function trackClick(id: string, req: Request): { visitorId: string } {
  const visitorId = readVisitorId(req.headers) ?? crypto.randomUUID();

  const redisWrite = redisConfigured()
    ? withRedis((client) => client.multi().incr(`clicks:${id}`).sAdd("ambassador_ids", id).exec()).catch(() => {})
    : Promise.resolve();

  // recordClick never throws (it retries, then queues the click in Redis);
  // the drain afterwards replays any clicks an earlier failure queued.
  const eventWrite = recordClick({
    slotCode: id,
    headers: req.headers,
    isTestClick: new URL(req.url).searchParams.get("test") === "1",
    visitorId,
  })
    .then(() => drainClickRetryQueue())
    .catch((error) => {
      console.error("[click-tracking] ClickEvent write failed:", error instanceof Error ? error.message : error);
    });

  // Not awaited: the redirect goes out immediately. `waitUntil` tells Vercel to
  // keep the function alive until both writes finish, so nothing is lost.
  waitUntil(Promise.all([redisWrite, eventWrite]));
  return { visitorId };
}

/** The settings reads must never take the redirect (or its click) down with them. */
async function loadContact(): Promise<HqContact> {
  try {
    return await getHqContact();
  } catch (error) {
    console.error("[referral-redirect] HQ contact read failed — using the shipped default:", error instanceof Error ? error.message : error);
    return HQ_CONTACT_FALLBACK;
  }
}

async function loadMessages(): Promise<{ referral: string; core: string }> {
  try {
    return await getAmbassadorLinkMessages();
  } catch (error) {
    console.error("[referral-redirect] link-message read failed — using the shipped default:", error instanceof Error ? error.message : error);
    return AMBASSADOR_LINK_MESSAGE_DEFAULTS;
  }
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPageWith(title: string, body: string, status: number, whatsappUrl: string) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>EduCraft</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,'Segoe UI',system-ui,sans-serif;background:#F8F9FA;color:#0F172A;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:1.25rem;margin-bottom:10px}p{color:#475569;line-height:1.6;font-size:.95rem}
a{display:inline-block;margin-top:22px;color:#0D9488;font-weight:600;text-decoration:none}.brand{margin-top:28px;font-size:.75rem;color:#64748B}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="${esc(whatsappUrl)}">Message EduCraft on WhatsApp</a><p class="brand">EduCraft — Academic &amp; Technical Documentation Experts</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** 302 to WhatsApp, carrying the visitor cookie the click was keyed on. */
function redirectWithVisitor(url: string, visitorId: string) {
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(VISITOR_COOKIE, visitorId, {
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: true,
  });
  return res;
}

export async function referralResponse(kind: ReferralKind, rawId: string, req: Request) {
  const id = decodeURIComponent(rawId ?? "").trim();
  const errorPage = async (title: string, body: string, status: number) =>
    errorPageWith(title, body, status, (await loadContact()).whatsappUrl);
  if (!id) return errorPage("Invalid link", "No ambassador ID was provided.", 400);

  if (kind === "ecca") {
    const code = id.toUpperCase();
    const core = await db.ambassadorSlot.findFirst({ where: { kind: "CORE", code }, select: { code: true, name: true } });
    if (!core) return errorPage("Link not found", "This Core Ambassador link does not exist.", 404);
    const { visitorId } = trackClick(core.code, req);
    const [hq, messages] = await Promise.all([loadContact(), loadMessages()]);
    return redirectWithVisitor(wa(hq.whatsapp, fillAmbassadorMessage(messages.core, core.name)), visitorId);
  }

  if (kind === "ecsa") {
    // The URL may arrive as "-001-001", "ECSA-001-001" or "001-001".
    const fullId = `ECSA-${id.toUpperCase().replace(/^ECSA-?/, "").replace(/^-/, "")}`;
    const sub = await db.ambassadorSlot.findFirst({
      where: { kind: "SUB", code: fullId },
      select: { code: true, name: true, vacant: true },
    });
    if (!sub) return errorPage("Link not found", "This Sub-Ambassador link does not exist.", 404);
    const { visitorId } = trackClick(sub.code, req);
    const [hq, messages] = await Promise.all([loadContact(), loadMessages()]);
    const message = fillAmbassadorMessage(messages.referral, sub.vacant ? null : sub.name);
    return redirectWithVisitor(wa(hq.whatsapp, message), visitorId);
  }

  // General ambassador. Old links were sometimes shared unpadded ("6").
  const code = /^\d+$/.test(id) ? id.padStart(3, "0") : id;
  const slot = await db.ambassadorSlot.findFirst({
    where: { kind: "GENERAL", code },
    select: { code: true, name: true, vacant: true },
  });
  if (!slot) {
    return errorPage("Link not found", "This ambassador link does not exist. Please contact EduCraft.", 404);
  }
  const { visitorId } = trackClick(slot.code, req);
  const [hq, messages] = await Promise.all([loadContact(), loadMessages()]);
  const message = fillAmbassadorMessage(messages.referral, slot.vacant ? null : slot.name);
  return redirectWithVisitor(wa(hq.whatsapp, message), visitorId);
}
