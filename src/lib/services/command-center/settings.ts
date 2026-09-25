import { db } from "@/lib/db";
import {
  THRESHOLD_DEFAULTS,
  THRESHOLD_KEYS,
  parseThresholds,
  parseThresholdValue,
  type ThresholdKey,
  type ThresholdMap,
} from "@/lib/command-center/rag";
import type { SettingsPayload } from "@/lib/command-center/types";

/**
 * The Command Center's RAG thresholds, stored as `cc.*` Setting rows
 * (Phase 5). Reads never write: a missing or unusable row simply means the
 * code default applies. `updateThreshold` is the one write the Command
 * Center makes, from PATCH /api/admin/command-center/settings.
 */

async function readRows(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany({ where: { key: { in: [...THRESHOLD_KEYS] } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Effective numbers (row value or default) for the RAG rules. */
export async function getThresholds(): Promise<ThresholdMap> {
  return parseThresholds(await readRows());
}

/** What the settings screen shows: effective strings, defaults, and which keys a row overrides. */
export async function getSettingsPayload(): Promise<SettingsPayload> {
  const rows = await readRows();
  const thresholds: Record<string, string> = {};
  const overridden: string[] = [];
  for (const key of THRESHOLD_KEYS) {
    const raw = rows[key];
    const usable = parseThresholdValue(raw) !== null;
    thresholds[key] = usable ? raw : THRESHOLD_DEFAULTS[key];
    if (usable) overridden.push(key);
  }
  return { thresholds, defaults: { ...THRESHOLD_DEFAULTS }, overridden };
}

/** One upsert. The value is already validated (`thresholdPatchSchema`). */
export async function updateThreshold(key: ThresholdKey, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
