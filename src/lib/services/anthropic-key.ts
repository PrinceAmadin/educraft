/**
 * Saving, checking and clearing the Anthropic API key the founder sets from
 * the admin settings (founder only — it is the credential the whole report
 * pipeline spends money with).
 *
 * A key is proved against Anthropic before it is stored, because a typo here
 * would break every report at once. The check uses the Models API, which is
 * free, so proving a key costs nothing. Anthropic refusing the key refuses the
 * save; Anthropic being unreachable does NOT — an outage must never stop the
 * founder changing his own key, so the key is stored unverified and the card
 * says so.
 *
 * The key never appears in a response body, a log line or the audit row: only
 * the masked hint from `keyHint`.
 */

import { db } from "@/lib/db";
import {
  ANTHROPIC_KEY_SETTING_KEYS as KEYS,
  getAnthropicKeyStatus,
  keyHint,
  looksLikeAnthropicKey,
  type AnthropicKeyStatus,
} from "@/lib/anthropic-key";
import { sealSecret } from "@/lib/secret-box";
import { setCreditBalance } from "@/lib/services/ai-usage";

/** A refusal the founder should read as-is (bad shape, or Anthropic said no). */
export class AnthropicKeySaveError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

const MODELS_URL = "https://api.anthropic.com/v1/models?limit=1";
const CHECK_TIMEOUT_MS = 15_000;

export type KeyCheck =
  | { ok: true }
  | { ok: false; rejected: true; message: string }
  | { ok: false; rejected: false; message: string };

/**
 * Does Anthropic accept this key? `GET /v1/models` needs no beta header and
 * spends no credit, so it proves the key without touching the balance.
 * `rejected` separates "Anthropic said no" (refuse the save) from "we could
 * not ask" (save it, unverified).
 */
export async function checkAnthropicKey(key: string): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await fetch(MODELS_URL, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    console.warn(`[anthropic-key] could not reach Anthropic to check the key: ${why}`);
    return { ok: false, rejected: false, message: "Anthropic could not be reached to check the key." };
  }

  if (res.ok) return { ok: true };

  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message?.trim();
    return {
      ok: false,
      rejected: true,
      message: detail
        ? `Anthropic did not accept that key: ${detail}`
        : "Anthropic did not accept that key. Check you copied all of it from the Console.",
    };
  }

  console.warn(`[anthropic-key] Anthropic answered ${res.status} when checking the key`);
  return { ok: false, rejected: false, message: `Anthropic answered ${res.status} when we checked the key.` };
}

export interface SetKeyInput {
  key: string;
  /** A new Claude account's credit, in USD — also restarts the spend window. */
  balanceUsd?: number | null;
}

export interface SetKeyResult {
  status: AnthropicKeyStatus;
  /** False when Anthropic could not be reached; the key was still saved. */
  verified: boolean;
  /** Why it is unverified, for the card. */
  note: string | null;
  balanceUsd: number | null;
}

/**
 * Stores a new key. Shape-checked, proved against Anthropic, sealed, then
 * written with its hint and provenance in one transaction. A `balanceUsd`
 * resets the credit balance through the existing `setCreditBalance`, which
 * also restarts the spend window — what a new account needs.
 */
export async function setAnthropicKey(
  input: SetKeyInput,
  actor: { userId: string },
): Promise<SetKeyResult> {
  const key = input.key.trim();
  if (!key) throw new AnthropicKeySaveError("Paste the API key.");
  if (!looksLikeAnthropicKey(key)) {
    throw new AnthropicKeySaveError(
      "That does not look like an Anthropic API key. It starts with sk-ant- and has no spaces."
    );
  }
  if (input.balanceUsd != null && (!Number.isFinite(input.balanceUsd) || input.balanceUsd < 0 || input.balanceUsd > 100_000)) {
    throw new AnthropicKeySaveError("Enter the credit balance in US dollars, or leave it blank.");
  }

  const check = await checkAnthropicKey(key);
  if (!check.ok && check.rejected) throw new AnthropicKeySaveError(check.message);
  const verified = check.ok;

  const before = await getAnthropicKeyStatus();
  const hint = keyHint(key);
  const now = new Date().toISOString();

  const rows: { key: string; value: string }[] = [
    { key: KEYS.sealed, value: sealSecret(key) },
    { key: KEYS.hint, value: hint },
    { key: KEYS.setAt, value: now },
    { key: KEYS.setById, value: actor.userId },
  ];

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.setting.upsert({ where: { key: row.key }, update: { value: row.value }, create: row });
    }
    if (verified) {
      await tx.setting.upsert({
        where: { key: KEYS.verifiedAt },
        update: { value: now },
        create: { key: KEYS.verifiedAt, value: now },
      });
    } else {
      // An unverified key must not inherit the previous key's tick.
      await tx.setting.deleteMany({ where: { key: KEYS.verifiedAt } });
    }
    // Hints only — the key itself never reaches the audit trail.
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "changed_anthropic_key",
        entityType: "AnthropicKey",
        entityId: "ai",
        beforeJson: { source: before.source, hint: before.hint },
        afterJson: { source: "setting", hint, verified },
      },
    });
  });

  let balanceUsd: number | null = null;
  if (input.balanceUsd != null) {
    await setCreditBalance(input.balanceUsd);
    balanceUsd = input.balanceUsd;
  }

  return {
    status: await getAnthropicKeyStatus(),
    verified,
    note: verified ? null : check.message,
    balanceUsd,
  };
}

/** Forgets the saved key so ANTHROPIC_API_KEY takes over again. */
export async function clearAnthropicKey(actor: { userId: string }): Promise<AnthropicKeyStatus> {
  const before = await getAnthropicKeyStatus();
  if (!before.hasSavedKey) throw new AnthropicKeySaveError("There is no saved key to remove.", 409);

  await db.$transaction(async (tx) => {
    await tx.setting.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "cleared_anthropic_key",
        entityType: "AnthropicKey",
        entityId: "ai",
        beforeJson: { source: before.source, hint: before.hint },
        afterJson: { source: "env" },
      },
    });
  });

  return getAnthropicKeyStatus();
}
