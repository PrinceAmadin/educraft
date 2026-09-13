import { z } from "zod";
import type { RedisClient } from "@/lib/ambassador-panel/redis";
import { SEED_ROSTER } from "@/lib/ambassador-panel/seed-roster";
import type { Roster } from "@/lib/ambassador-panel/types";

/**
 * The roster — slots, Core and Sub Ambassadors.
 *
 * The original app kept the roster in source code and pushed edits to GitHub
 * for a redeploy ("Deploy to GitHub"). In HQ it lives in Redis under one key
 * and edits save instantly; the first read seeds it from the original file.
 * The original deployment keeps reading its own copy, so nothing it serves
 * changes until it is retired.
 */

export const ROSTER_KEY = "panel:roster:v1";

const status = z.enum(["active", "vacant"]);
const name = z.string().trim().max(80);

export const rosterSchema = z.object({
  educraft_whatsapp: z.string().regex(/^\d{10,15}$/, "WhatsApp number must be 10–15 digits"),
  slots: z.record(
    z.string().regex(/^\d{1,6}$/, "Slot IDs are numbers"),
    z.object({ name, school: name, status })
  ),
  coreAmbassadors: z.array(
    z.object({
      id: z.string().regex(/^ECCA-[A-Z0-9-]+$/, "Core IDs start with ECCA-"),
      name,
      school: name,
      percentage: z.number().min(0).max(100),
      status: status.optional(),
    })
  ),
  subAmbassadors: z.array(
    z.object({
      id: z.string().regex(/^ECSA-[A-Z0-9-]+$/, "Sub IDs start with ECSA-"),
      name,
      school: name,
      percentage: z.number().min(0).max(100),
      coreId: z.string().regex(/^ECCA-[A-Z0-9-]+$/),
      status: status.optional(),
    })
  ),
});

export async function readRoster(client: RedisClient): Promise<Roster> {
  const raw = await client.get(ROSTER_KEY);
  if (raw) {
    try {
      const parsed = rosterSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      /* fall through to the seed */
    }
  }
  // First read (or an unreadable value): seed from the original roster.
  await client.set(ROSTER_KEY, JSON.stringify(SEED_ROSTER));
  return structuredClone(SEED_ROSTER);
}

export async function writeRoster(client: RedisClient, roster: Roster): Promise<Roster> {
  const parsed = rosterSchema.parse(roster);
  await client.set(ROSTER_KEY, JSON.stringify(parsed));
  return parsed;
}

/** Next general slot number after the highest in use: "061". */
export function nextSlotId(slots: Roster["slots"]): string {
  const ns = Object.keys(slots)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n));
  return String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3, "0");
}

export function nextCoreId(roster: Roster): string {
  const nums = roster.coreAmbassadors.map((c) => {
    const m = c.id.match(/ECCA-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return `ECCA-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
}

export function nextSubId(roster: Roster, coreId: string): string {
  const core = coreId.replace(/^ECCA-/, "");
  const nums = roster.subAmbassadors
    .filter((s) => s.coreId === coreId)
    .map((s) => {
      const m = s.id.match(/ECSA-\d+-(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
  return `ECSA-${core}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
}
