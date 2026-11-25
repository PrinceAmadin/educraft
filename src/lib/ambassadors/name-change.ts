/**
 * An ambassador may correct their own name (Nov 2026, founder's call after the
 * COO had to relay one by hand). The rules here are pure, so
 * `npm run check:name-change` tests every refusal with no database.
 *
 * WHY THIS IS SAFE FOR ATTRIBUTION — the reason the founder worried, written
 * down so nobody has to re-derive it: a name is a LABEL in HQ, never identity.
 *   - `referralCode` is minted once and stored. `buildReferralCode` seeds its
 *     first three letters from the name at creation (BLE-LAG-847) and is never
 *     run again, so a rename leaves the code — and every link already shared —
 *     exactly as it was.
 *   - Every attribution is a foreign key on the record id: `Project.ambassadorId`,
 *     `AmbassadorReferral.ambassadorId`, `Payment.ambassadorId`,
 *     `ClickEvent.ambassadorId`, the referred `Client` rows. None reads a name.
 *   - `EC-A-XXXXX`, the roster slot code and `legacySlotId` are untouched.
 *   - `PayoutRecord.recipientName` is a snapshot taken when the payout was
 *     written, so the books keep the name each payout was actually paid under.
 *
 * What a self-service name CAN damage is trust, so the guards below are about
 * that, not about attribution: nobody may pass themselves off as EduCraft or as
 * another ambassador at their school, and nobody may churn the name that the
 * public leaderboard and the client WhatsApp message both show.
 */

/** One self-service change per this many days. An admin correction is not throttled. */
export const NAME_CHANGE_COOLDOWN_DAYS = 30;

/** Counted in letters, so "Ij" is refused and "Blessing O." is not. */
export const NAME_MIN_LETTERS = 4;
export const NAME_MAX_LENGTH = 60;

/** Who made a change, for the history the Head of Growth reads. */
export type NameChangeSource = "SELF" | "ADMIN";

export type NameRefusal =
  | "empty"
  | "too_short"
  | "too_long"
  | "one_word"
  | "bad_characters"
  | "reserved"
  | "unchanged";

export type NameCheck = { ok: true; name: string } | { ok: false; reason: NameRefusal; message: string };

/**
 * Words nobody may put in their own name, because the leaderboard and the
 * client's WhatsApp message show it with EduCraft's authority behind it. Matched
 * as whole words, so a real name that merely contains one as a fragment is left
 * alone. Deliberately NOT here: "edu" and "craft" on their own — Edu is a real
 * Nigerian surname, and the squashed check in `reservedWordIn` already catches
 * "Edu Craft" however it is spaced.
 */
const RESERVED_WORDS = [
  "educraft",
  "admin", "administrator", "moderator", "mod", "staff", "team", "official", "verified", "verify",
  "support", "help", "helpdesk", "service", "services", "customer",
  "ceo", "cfo", "coo", "cto", "founder", "cofounder", "director", "manager",
  "sales", "billing", "payment", "payments", "finance", "account", "accounts",
  "bot", "system", "test", "null", "undefined", "anonymous", "unknown",
];

/**
 * Invisible characters, which a name has no use for and a spoofer does. Written
 * as escapes on purpose: the literal characters are unreadable in source.
 */
const ZERO_WIDTH = /[​‌‍﻿­]/g;
/** Anything that is neither a letter, a combining mark, nor that punctuation. */
const DISALLOWED_CHAR = /[^\p{L}\p{M} '’.-]/u;
/** The shape of a name: it opens on a letter and closes on a letter or a full stop. */
const SHAPE = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*[\p{L}\p{M}.]$/u;
/** A web address or a handle, which passes the character guard because dots are allowed. */
const LOOKS_LIKE_LINK = /(?:^|\s)www\.|\.(?:com|net|org|edu|gov|ng|io|me|co|xyz|info|biz)(?:\s|$)/i;
/** Splits on everything that is not part of a word, for word-level checks. */
const NON_WORD = /[^\p{L}\p{M}]+/u;

/** Title-cases one word, keeping O'Brien and Ade-Bayo whole. */
function titleWord(word: string): string {
  return word.replace(/[\p{L}\p{M}]+/gu, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

/**
 * Trims, collapses runs of whitespace, drops invisible characters, and
 * title-cases a name typed entirely in capitals (a phone keyboard left on caps
 * is the common case). A name with any lower-case letter in it is left exactly
 * as the person typed it — their own capitalisation is their business.
 */
export function normalizeName(raw: string): string {
  const cleaned = raw.replace(ZERO_WIDTH, "").replace(/\s+/gu, " ").trim();
  if (!cleaned) return "";
  const shouted = cleaned === cleaned.toUpperCase() && cleaned !== cleaned.toLowerCase();
  return shouted ? cleaned.split(" ").map(titleWord).join(" ") : cleaned;
}

/** The same person's name for duplicate purposes: case and spacing do not count. */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

function letterCount(name: string): number {
  return (name.match(/[\p{L}\p{M}]/gu) ?? []).length;
}

function wordsOf(name: string): string[] {
  return normalizeName(name).toLowerCase().split(NON_WORD).filter(Boolean);
}

/** The reserved word a name uses, or null. Whole words, plus "educraft" written with anything between its halves. */
export function reservedWordIn(name: string): string | null {
  if (name.toLowerCase().replace(/[^a-z]/g, "").includes("educraft")) return "educraft";
  return wordsOf(name).find((w) => RESERVED_WORDS.includes(w)) ?? null;
}

/**
 * Checks a name the ambassador typed against the one they hold. Returns the
 * normalized name to store, or the one refusal to show them.
 */
export function checkName(raw: string, current: string): NameCheck {
  const name = normalizeName(raw);
  const refuse = (reason: NameRefusal): NameCheck => ({ ok: false, reason, message: NAME_CHANGE_TEXT.refusal[reason] });
  if (!name) return refuse("empty");
  if (name.length > NAME_MAX_LENGTH) return refuse("too_long");
  // Order matters: a digit or a link is named as such before the name is judged
  // too short, so "Blessing123" is never refused for its length.
  if (DISALLOWED_CHAR.test(name)) return refuse("bad_characters");
  if (letterCount(name) < NAME_MIN_LETTERS) return refuse("too_short");
  if (!SHAPE.test(name)) return refuse("bad_characters");
  if (LOOKS_LIKE_LINK.test(name)) return refuse("bad_characters");
  // Impersonation is judged before the shape of the name, so "Admin" and
  // "www.educraft.ng" are both told the real reason rather than "give your full name".
  if (reservedWordIn(name)) return refuse("reserved");
  if (name.split(" ").length < 2) return refuse("one_word");
  if (sameName(name, current)) return refuse("unchanged");
  return { ok: true, name };
}

export interface CooldownState {
  canChange: boolean;
  /** When the next self-service change is allowed. null once it is allowed. */
  availableAt: Date | null;
  /** Whole days still to wait, rounded up. 0 once it is allowed. */
  daysLeft: number;
}

/**
 * Whether a self-service change is open, judged from the last SELF change only
 * — an admin correction never spends the ambassador's own allowance.
 */
export function cooldownState(lastSelfChangeAt: Date | null, now: Date = new Date()): CooldownState {
  if (!lastSelfChangeAt) return { canChange: true, availableAt: null, daysLeft: 0 };
  const day = 24 * 60 * 60 * 1000;
  const availableAt = new Date(lastSelfChangeAt.getTime() + NAME_CHANGE_COOLDOWN_DAYS * day);
  const ms = availableAt.getTime() - now.getTime();
  if (ms <= 0) return { canChange: true, availableAt: null, daysLeft: 0 };
  return { canChange: false, availableAt, daysLeft: Math.ceil(ms / day) };
}

/**
 * Whether the bank account name no longer looks like the new name, so the
 * ambassador is nudged to update it too. A nudge only — payouts are never
 * blocked on it, and finance confirms the account itself. One shared word (a
 * surname, usually) is enough to read as the same person.
 */
export function bankNameLooksStale(newName: string, accountName: string | null): boolean {
  if (!accountName?.trim()) return false;
  if (sameName(newName, accountName)) return false;
  const bank = new Set(wordsOf(accountName).filter((w) => w.length > 1));
  return !wordsOf(newName).some((w) => w.length > 1 && bank.has(w));
}

/** Every sentence an ambassador or the Head of Growth reads about a name change. */
export const NAME_CHANGE_TEXT = {
  heading: "Your name",
  help: "This is the name clients and the leaderboard see. Use your real name, as your school knows it.",
  codeFrozen:
    "Changing your name does not change your referral code or your link. Every link you have already shared keeps working, and every client you have referred stays yours.",
  save: "Save my name",
  saving: "Saving…",
  saved: "Saved — this is the name clients will see.",
  refusal: {
    empty: "Type your name.",
    too_short: "That looks too short to be your full name.",
    too_long: `Keep your name to ${NAME_MAX_LENGTH} characters or fewer.`,
    one_word: "Give your full name — at least a first name and a surname.",
    bad_characters: "Use letters only, with spaces, hyphens or apostrophes. No numbers, links or symbols.",
    reserved: "That name reads as if you work for EduCraft itself, so it cannot be used. Use your own name.",
    unchanged: "That is already your name.",
    duplicate:
      "Another ambassador at your school already uses that name. Add your middle name or surname so you can be told apart.",
  },
  cooldown(daysLeft: number): string {
    if (daysLeft <= 1) return "You changed your name recently. You can change it again tomorrow.";
    return `You changed your name recently. You can change it again in ${daysLeft} days.`;
  },
  cooldownHelp: `A name can be changed once every ${NAME_CHANGE_COOLDOWN_DAYS} days. Need it sooner? Message the Head of Growth.`,
  bankNudge(accountName: string): string {
    return `Your commission is paid into an account named ${accountName}. If that changed too, update your bank details below so finance can still pay you.`;
  },
  formerly(oldName: string): string {
    return `Formerly ${oldName}`;
  },
  hogTitle: "Ambassador changed their name",
  hogMessage(oldName: string, newName: string, ambassadorId: string): string {
    return `${oldName} is now ${newName} (${ambassadorId}). Their referral code and link are unchanged.`;
  },
} as const;
