/**
 * Display IDs for each record type.
 *
 * Clients and workers moved from EC-C-00009 / EC-W-00003 (5 digits) to
 * ECC-0009 / ECW-0003 (4 digits, still counting past 9999) in Sept 2026 so the
 * two are told apart at a glance. Projects, ambassadors and payments keep
 * their formats. One client ID per person: a returning client's new order
 * joins their existing ID.
 *
 * Pure (no database), so the sign-in form and scripts can import it too.
 */
export const ID_FORMAT = {
  PROJECT: { prefix: "EC-", pad: 5 },
  CLIENT: { prefix: "ECC-", pad: 4 },
  WORKER: { prefix: "ECW-", pad: 4 },
  AMBASSADOR: { prefix: "EC-A-", pad: 5 },
  PAYMENT: { prefix: "EC-PAY-", pad: 5 },
} as const;

export type IdKind = keyof typeof ID_FORMAT;

export function formatId(kind: IdKind, n: number): string {
  const { prefix, pad } = ID_FORMAT[kind];
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

/**
 * A stored Client ID. Anchored on purpose: core ambassador slots are
 * "ECCA-001" and must never read as a client.
 */
export const CLIENT_ID_RE = /^ECC-\d{4,8}$/;
export const WORKER_ID_RE = /^ECW-\d{4,8}$/;

/** Placeholder shown in sign-in fields. */
export const CLIENT_ID_EXAMPLE = "ECC-0124";

function readTyped(kind: "CLIENT" | "WORKER", letter: "C" | "W", raw: string): string | null {
  // "ecc 9", "ECC0009", "ecc-00009" -> "ECC-0009". "ECCA-001" fails: an A follows ECC.
  const match = new RegExp(`^\\s*EC${letter}[\\s-]*(\\d{1,8})\\s*$`, "i").exec(raw);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return n > 0 ? formatId(kind, n) : null;
}

/** Forgiving reading of a typed Client ID; anything else (an email, a slot code) is null. */
export function normalizeClientIdInput(raw: string): string | null {
  return readTyped("CLIENT", "C", raw);
}

/** Forgiving reading of a typed Worker ID. */
export function normalizeWorkerIdInput(raw: string): string | null {
  return readTyped("WORKER", "W", raw);
}
