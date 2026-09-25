import { db } from "@/lib/db";

/**
 * Growth Associates (Phase 3 Section 7) are a Year 2 feature: the schema is
 * built (GrowthAssociate, Ambassador.growthAssociateId) but the product is
 * not. Until then the page explains the idea, and "Notify me when this
 * launches" records who asked (Setting "growth_associates_notify": a JSON
 * list of user ids) so they can be told when it is switched on.
 */

const KEY = "growth_associates_notify";

async function read(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function wantsLaunchNotice(userId: string): Promise<boolean> {
  return (await read()).includes(userId);
}

/** Save (or withdraw) this person's "notify me when Growth Associates launch". */
export async function setLaunchNotice(userId: string, subscribe: boolean): Promise<boolean> {
  const current = new Set(await read());
  if (subscribe) current.add(userId);
  else current.delete(userId);
  const value = JSON.stringify([...current]);
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return subscribe;
}

/** Who asked to be told (for the Year 2 launch). */
export async function launchNoticeList(): Promise<string[]> {
  return read();
}
