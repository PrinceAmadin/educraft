import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { redisConfigured, withRedis } from "@/lib/ambassador-panel/redis";
import { recordClick } from "@/lib/click-tracking/record-click";
import { db } from "@/lib/db";
import { EDUCRAFT_WHATSAPP, waLink } from "@/lib/whatsapp";

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
 * writes start together and are handed to `waitUntil`: the student is
 * redirected immediately and Vercel keeps the function alive until the writes
 * finish. Neither write can fail or delay the redirect.
 */

export type ReferralKind = "ambassador" | "ecca" | "ecsa";

const wa = waLink;

function trackClick(id: string, req: Request): void {
  const redisWrite = redisConfigured()
    ? withRedis((client) => client.multi().incr(`clicks:${id}`).sAdd("ambassador_ids", id).exec()).catch(() => {})
    : Promise.resolve();

  const eventWrite = recordClick({
    slotCode: id,
    headers: req.headers,
    isTestClick: new URL(req.url).searchParams.get("test") === "1",
  }).catch((error) => {
    console.error("[click-tracking] ClickEvent write failed:", error instanceof Error ? error.message : error);
  });

  // Not awaited: the redirect goes out immediately. `waitUntil` tells Vercel to
  // keep the function alive until both writes finish, so nothing is lost.
  waitUntil(Promise.all([redisWrite, eventWrite]));
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(title: string, body: string, status: number) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>EduCraft</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,'Segoe UI',system-ui,sans-serif;background:#F8F9FA;color:#0F172A;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:1.25rem;margin-bottom:10px}p{color:#475569;line-height:1.6;font-size:.95rem}
a{display:inline-block;margin-top:22px;color:#0D9488;font-weight:600;text-decoration:none}.brand{margin-top:28px;font-size:.75rem;color:#64748B}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="https://wa.me/2347063421088">Message EduCraft on WhatsApp</a><p class="brand">EduCraft — Academic &amp; Technical Documentation Experts</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function referralResponse(kind: ReferralKind, rawId: string, req: Request) {
  const id = decodeURIComponent(rawId ?? "").trim();
  if (!id) return errorPage("Invalid link", "No ambassador ID was provided.", 400);

  const number = EDUCRAFT_WHATSAPP;

  if (kind === "ecca") {
    const code = id.toUpperCase();
    const core = await db.ambassadorSlot.findFirst({ where: { kind: "CORE", code }, select: { code: true, name: true } });
    if (!core) return errorPage("Link not found", "This Core Ambassador link does not exist.", 404);
    trackClick(core.code, req);
    return NextResponse.redirect(
      wa(
        number,
        `Hi EduCraft! I was brought in by ${core.name}. I'd love to know more about the EduCraft Ambassadorship Program and how I can be a part of the brand.`
      ),
      302
    );
  }

  if (kind === "ecsa") {
    // The URL may arrive as "-001-001", "ECSA-001-001" or "001-001".
    const fullId = `ECSA-${id.toUpperCase().replace(/^ECSA-?/, "").replace(/^-/, "")}`;
    const sub = await db.ambassadorSlot.findFirst({
      where: { kind: "SUB", code: fullId },
      select: { code: true, name: true, vacant: true },
    });
    if (!sub) return errorPage("Link not found", "This Sub-Ambassador link does not exist.", 404);
    trackClick(sub.code, req);
    const message =
      sub.vacant || !sub.name
        ? "Hi EduCraft! I'd like to place an order on the following Services:"
        : `Hi EduCraft! I was referred by ${sub.name}. I'd like to place an order on the following Services:`;
    return NextResponse.redirect(wa(number, message), 302);
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
  trackClick(slot.code, req);
  const message =
    slot.vacant || !slot.name
      ? "Hi EduCraft! I'd like to place an order on the following Services:"
      : `Hi EduCraft! I was referred by ${slot.name}. I'd like to place an order on the following Services:`;
  return NextResponse.redirect(wa(number, message), 302);
}
