import { NextResponse } from "next/server";
import { esc } from "@/lib/ambassador-panel/email";
import { redisConfigured, withRedis } from "@/lib/ambassador-panel/redis";
import { readRoster } from "@/lib/ambassador-panel/roster";
import { SEED_ROSTER } from "@/lib/ambassador-panel/seed-roster";
import type { Roster } from "@/lib/ambassador-panel/types";

/**
 * Referral links → WhatsApp, exactly as the original `api/redirect.ts`:
 *
 *   /EduCraftA/{slot}   general ambassador client link
 *   /ECCA/{id}          Core Ambassador recruitment link
 *   /ECSA/{id}          Sub-Ambassador client link
 *
 * Every visit increments `clicks:{id}` and adds the id to `ambassador_ids`.
 * The original fired that write and forgot it, which a serverless function can
 * cut off after the redirect is sent; here it is awaited, capped at 1.5s, so a
 * slow Redis never delays the student by more than that.
 */

export type ReferralKind = "ambassador" | "ecca" | "ecsa";

const wa = (number: string, message: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

async function trackClick(id: string) {
  if (!redisConfigured()) return;
  const write = withRedis((client) => client.multi().incr(`clicks:${id}`).sAdd("ambassador_ids", id).exec()).catch(() => {});
  await Promise.race([write, new Promise((resolve) => setTimeout(resolve, 1500))]);
}

async function loadRoster(): Promise<Roster> {
  if (!redisConfigured()) return SEED_ROSTER;
  try {
    return await withRedis(readRoster);
  } catch {
    return SEED_ROSTER;
  }
}

async function readProfileName(key: string): Promise<string | null> {
  if (!redisConfigured()) return null;
  try {
    const raw = await withRedis((client) => client.get(key));
    const name = raw ? (JSON.parse(raw) as { name?: string }).name?.trim() : "";
    return name || null;
  } catch {
    return null;
  }
}

function errorPage(title: string, body: string, status: number) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>EduCraft</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,'Segoe UI',system-ui,sans-serif;background:#F8F9FA;color:#0F172A;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:1.25rem;margin-bottom:10px}p{color:#475569;line-height:1.6;font-size:.95rem}
a{display:inline-block;margin-top:22px;color:#0D9488;font-weight:600;text-decoration:none}.brand{margin-top:28px;font-size:.75rem;color:#64748B}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="https://wa.me/2347063421088">Message EduCraft on WhatsApp</a><p class="brand">EduCraft — Academic &amp; Technical Documentation Experts</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function referralResponse(kind: ReferralKind, rawId: string) {
  const id = decodeURIComponent(rawId ?? "").trim();
  if (!id) return errorPage("Invalid link", "No ambassador ID was provided.", 400);

  const roster = await loadRoster();
  const number = roster.educraft_whatsapp;

  if (kind === "ecca") {
    const core = roster.coreAmbassadors.find((c) => c.id === id.toUpperCase());
    if (!core) return errorPage("Link not found", "This Core Ambassador link does not exist.", 404);
    await trackClick(core.id);
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
    const name =
      (await readProfileName(`sub_profile:${fullId}`)) ??
      roster.subAmbassadors.find((s) => s.id === fullId)?.name?.trim() ??
      null;
    if (!name) return errorPage("Link not found", "This Sub-Ambassador link does not exist.", 404);
    await trackClick(fullId);
    return NextResponse.redirect(
      wa(number, `Hi EduCraft! I was referred by ${name}. I'd like to place an order on the following Services:`),
      302
    );
  }

  // General ambassador — an approved Redis profile wins over the roster.
  const profileName = await readProfileName(`profile:${id}`);
  if (profileName) {
    await trackClick(id);
    return NextResponse.redirect(
      wa(number, `Hi EduCraft! I was referred by ${profileName}. I'd like to place an order on the following Services:`),
      302
    );
  }

  const slot = roster.slots[id];
  if (!slot) {
    return errorPage("Link not found", "This ambassador link does not exist. Please contact EduCraft.", 404);
  }
  await trackClick(id);
  const message =
    slot.status === "vacant" || !slot.name
      ? "Hi EduCraft! I'd like to place an order on the following Services:"
      : `Hi EduCraft! I was referred by ${slot.name}. I'd like to place an order on the following Services:`;
  return NextResponse.redirect(wa(number, message), 302);
}
