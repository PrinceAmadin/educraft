/**
 * The Anthropic API key HQ makes its Claude calls with.
 *
 * The key used to be `ANTHROPIC_API_KEY` alone, which meant changing Claude
 * accounts was a Vercel environment edit plus a redeploy. It is now a saved
 * setting the founder changes on Settings > General or on the AI usage tab,
 * with the environment variable left as the backstop — the same shape as the
 * ₦/$ rate in `fx-rate.ts`, which moved off its env var the same way.
 *
 * Precedence: the saved key wins; the environment variable is used when none
 * is saved, or when a saved one cannot be decrypted (a rotated AUTH_SECRET).
 * Nothing is cached — one indexed read beside a Claude call that takes tens of
 * seconds is free, and it means a new key takes effect on the very next call
 * with no stale window and no redeploy.
 *
 * `getAnthropicKeyStatus` is what the screens render. It deliberately has no
 * field that can carry the key itself: only a masked hint.
 */

import { db } from "@/lib/db";
import { openSecret } from "@/lib/secret-box";

export const ANTHROPIC_KEY_SETTING_KEYS = {
  /** The AES-256-GCM blob from `secret-box.ts` — never the plain key. */
  sealed: "ai.anthropicApiKey",
  /** Display-safe fragment, e.g. "sk-ant-api03…9fQa". */
  hint: "ai.anthropicApiKeyHint",
  setAt: "ai.anthropicApiKeySetAt",
  setById: "ai.anthropicApiKeySetById",
  /** Set when Anthropic accepted the key at save time; absent if it could not be reached. */
  verifiedAt: "ai.anthropicApiKeyVerifiedAt",
} as const;

export class AnthropicKeyError extends Error {}

export type AnthropicKeySource = "setting" | "env" | "none";

export interface AnthropicKeyStatus {
  /** Which layer a Claude call would use right now. */
  source: AnthropicKeySource;
  hint: string | null;
  setAt: string | null;
  setByName: string | null;
  verifiedAt: string | null;
  /** A key is saved here (whether or not it can be read). */
  hasSavedKey: boolean;
  /** A key is saved but will not decrypt — AUTH_SECRET changed. */
  unreadable: boolean;
  hasEnvFallback: boolean;
}

const HINT_PREFIX_CHARS = 12;
const HINT_SUFFIX_CHARS = 4;
/** Anthropic keys are ~100 characters; this only rules out obvious mistakes. */
const MIN_KEY_LENGTH = 24;
const MAX_KEY_LENGTH = 400;

/**
 * A display-safe fragment of a key: the leading `sk-ant-api03`-style prefix,
 * which identifies nothing on its own, and the last four characters so the
 * founder can tell two keys apart. Never reveals more than that.
 */
export function keyHint(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= HINT_PREFIX_CHARS + HINT_SUFFIX_CHARS) return `${k.slice(0, 4)}…`;
  return `${k.slice(0, HINT_PREFIX_CHARS)}…${k.slice(-HINT_SUFFIX_CHARS)}`;
}

/**
 * Does an HTTP status from Anthropic settle the key's fate, or should we try
 * again later?
 *
 * A 4xx is Anthropic's own verdict on the key and no amount of waiting changes
 * it: a wrong or revoked key (401/403), or one of the wrong KIND — an account
 * key where a workspace-scoped key is needed, which answers 400 and would then
 * fail every single Claude call the pipeline makes. A key like that MUST be
 * refused at the save: stored, it beats `ANTHROPIC_API_KEY` and takes report
 * generation, the quality gate and every chapter check down silently.
 *
 * 408, 429 and any 5xx are worth asking again, and so are a timeout and no
 * network: those mean "we could not ask", and the key is saved unverified,
 * because an Anthropic outage must never lock the founder out of changing his
 * own key.
 */
export function anthropicRefusedKey(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/** Shape check only — whether Anthropic accepts it is settled by a real call. */
export function looksLikeAnthropicKey(key: string): boolean {
  const k = key.trim();
  if (k.length < MIN_KEY_LENGTH || k.length > MAX_KEY_LENGTH) return false;
  if (!k.startsWith("sk-ant-")) return false;
  // A pasted key must not have picked up whitespace or quotes in the middle.
  return /^[A-Za-z0-9_-]+$/.test(k);
}

function envKey(): string | null {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  return k ? k : null;
}

async function readRows(): Promise<Record<string, string | undefined>> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(ANTHROPIC_KEY_SETTING_KEYS) } },
  });
  const out: Record<string, string | undefined> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * The key for an outbound Claude call. Resolve this ONCE per logical
 * operation and pass it down — never per retry attempt, so a missing key is
 * not retried as though it were a dropped connection.
 */
export async function resolveAnthropicKey(): Promise<{ key: string; source: "setting" | "env" }> {
  const rows = await readRows();
  const saved = openSecret(rows[ANTHROPIC_KEY_SETTING_KEYS.sealed]);
  if (saved) return { key: saved, source: "setting" };

  if (rows[ANTHROPIC_KEY_SETTING_KEYS.sealed]) {
    console.warn("[anthropic-key] the saved key could not be decrypted; falling back to ANTHROPIC_API_KEY");
  }
  const env = envKey();
  if (env) return { key: env, source: "env" };

  throw new AnthropicKeyError(
    "No Anthropic API key. Save one on Settings > General, or set ANTHROPIC_API_KEY."
  );
}

/** What the screens show. Never includes the key. */
export async function getAnthropicKeyStatus(): Promise<AnthropicKeyStatus> {
  const rows = await readRows();
  const sealed = rows[ANTHROPIC_KEY_SETTING_KEYS.sealed];
  const hasSavedKey = Boolean(sealed);
  const readable = hasSavedKey ? openSecret(sealed) !== null : false;
  const hasEnvFallback = envKey() !== null;

  const setById = rows[ANTHROPIC_KEY_SETTING_KEYS.setById];
  let setByName: string | null = null;
  if (setById) {
    // Same precedence the cashflow audit log uses for an actor's name.
    const user = await db.user.findUnique({
      where: { id: setById },
      select: { displayName: true, email: true, execProfile: { select: { fullName: true } } },
    });
    setByName = user?.execProfile?.fullName ?? user?.displayName ?? user?.email ?? null;
  }

  const source: AnthropicKeySource = readable ? "setting" : hasEnvFallback ? "env" : "none";

  return {
    source,
    hint: readable ? rows[ANTHROPIC_KEY_SETTING_KEYS.hint] ?? null : null,
    setAt: readable ? rows[ANTHROPIC_KEY_SETTING_KEYS.setAt] ?? null : null,
    setByName: readable ? setByName : null,
    verifiedAt: readable ? rows[ANTHROPIC_KEY_SETTING_KEYS.verifiedAt] ?? null : null,
    hasSavedKey,
    unreadable: hasSavedKey && !readable,
    hasEnvFallback,
  };
}
