/**
 * Checks the ambassador self-service name rules with no database:
 *
 *   npm run check:name-change
 *
 * Normalisation, every refusal, the 30-day cooldown, the duplicate comparison,
 * the bank-name nudge, and the wording the ambassador reads.
 */
import {
  NAME_CHANGE_COOLDOWN_DAYS,
  NAME_CHANGE_TEXT,
  NAME_MAX_LENGTH,
  NAME_MIN_LETTERS,
  bankNameLooksStale,
  checkName,
  cooldownState,
  normalizeName,
  reservedWordIn,
  sameName,
  type NameRefusal,
} from "../src/lib/ambassadors/name-change";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}
/** The refusal a name gets, or "ok" plus what would be stored. */
function verdict(raw: string, current = "Blessing Okafor"): NameRefusal | string {
  const r = checkName(raw, current);
  return r.ok ? `ok:${r.name}` : r.reason;
}

// ── Normalisation ─────────────────────────────────────────────────────────────

expect("spaces collapse", normalizeName("  Chidi   Nwosu  "), "Chidi Nwosu");
expect("ALL CAPS is title-cased (phone keyboard)", normalizeName("CHIDI NWOSU"), "Chidi Nwosu");
expect("caps title-casing keeps an apostrophe whole", normalizeName("CHIDI O'BRIEN"), "Chidi O'Brien");
expect("caps title-casing keeps a hyphen whole", normalizeName("ADE-BAYO OKEKE"), "Ade-Bayo Okeke");
expect("their own capitalisation is left alone", normalizeName("chidi de Souza"), "chidi de Souza");
expect("a mixed-case name is untouched", normalizeName("Ngozi MacDonald"), "Ngozi MacDonald");
expect("accents survive", normalizeName("Zainab Bâ"), "Zainab Bâ");
expect("zero-width spoofing characters are stripped", normalizeName("Chidi​Nwosu Okeke"), "ChidiNwosu Okeke");
expect("a tab counts as a space", normalizeName("Chidi\tNwosu"), "Chidi Nwosu");
expect("nothing but whitespace is empty", normalizeName("   "), "");

// ── sameName ──────────────────────────────────────────────────────────────────

expect("case does not count", sameName("Chidi Nwosu", "CHIDI NWOSU"), true);
expect("spacing does not count", sameName("Chidi  Nwosu", " Chidi Nwosu "), true);
expect("different people are different", sameName("Chidi Nwosu", "Chidi Nwosu Okeke"), false);

// ── Refusals, in the order the ambassador meets them ──────────────────────────

expect("a real correction passes", verdict("Chidi Nwosu"), "ok:Chidi Nwosu");
expect("a three-part name passes", verdict("Chidi Emeka Nwosu"), "ok:Chidi Emeka Nwosu");
expect("an initial passes", verdict("Chidi E. Nwosu"), "ok:Chidi E. Nwosu");
expect("an apostrophe passes", verdict("Ngozi O'Brien"), "ok:Ngozi O'Brien");
expect("a hyphen passes", verdict("Ade-Bayo Okeke"), "ok:Ade-Bayo Okeke");
expect("a curly apostrophe passes", verdict("Ngozi O’Brien"), "ok:Ngozi O’Brien");
expect("empty", verdict(""), "empty");
expect("whitespace only", verdict("     "), "empty");
expect("too long", verdict("Chidi ".repeat(20)), "too_long");
expect("digits are named as digits, not as length", verdict("Blessing123"), "bad_characters");
expect("a link is refused", verdict("www.educraft.ng"), "bad_characters");
expect("an email is refused", verdict("chidi@example.com"), "bad_characters");
expect("a bare web address is refused", verdict("Chidi Nwosu.com"), "bad_characters");
expect("a www handle is refused", verdict("www.chidi.ng"), "bad_characters");
expect("an emoji is refused", verdict("Chidi Nwosu 🔥"), "bad_characters");
expect("a single letter is a length problem", verdict("A"), "too_short");
expect("two letters is a length problem", verdict("Ij"), "too_short");
expect("too few letters even across two words", verdict("A B"), "too_short");
expect("a leading hyphen is a shape problem", verdict("-Chidi Nwosu"), "bad_characters");
expect("a trailing apostrophe is a shape problem", verdict("Chidi Nwosu'"), "bad_characters");
expect("one word is refused", verdict("Chairman"), "one_word");
expect("one long word is still one word", verdict("Chidinwosuokeke"), "one_word");
expect("their current name is refused", verdict("Blessing Okafor"), "unchanged");
expect("their current name in caps is refused", verdict("BLESSING OKAFOR"), "unchanged");

// ── Impersonation ─────────────────────────────────────────────────────────────

expect("EduCraft in a name", verdict("EduCraft Official"), "reserved");
expect("EduCraft spaced out is still EduCraft", verdict("Edu Craft Support"), "reserved");
expect("EduCraft hyphenated is still EduCraft", verdict("Edu-Craft Nwosu"), "reserved");
expect("admin", verdict("Admin Chidi"), "reserved");
expect("support", verdict("Chidi Support"), "reserved");
expect("an office", verdict("Chidi CEO"), "reserved");
expect("verified", verdict("Chidi Verified"), "reserved");
expect("a bare reserved word is called out as one, not as a missing surname", verdict("Admin"), "reserved");
expect("Edu alone is a real surname and passes", verdict("Chidi Edu"), "ok:Chidi Edu");
expect("Edu as a first name passes", verdict("Edu Nwosu"), "ok:Edu Nwosu");
expect("a name merely containing a reserved fragment passes", verdict("Modupe Teamah"), "ok:Modupe Teamah");
expect("reservedWordIn names the word", reservedWordIn("Chidi Support"), "support");
expect("reservedWordIn is null on a clean name", reservedWordIn("Chidi Nwosu"), null);

// ── Cooldown ──────────────────────────────────────────────────────────────────

const now = new Date("2026-11-25T09:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

expect("a first change is open", cooldownState(null, now).canChange, true);
expect("a first change has no date to wait for", cooldownState(null, now).availableAt, null);
expect("just changed is closed", cooldownState(daysAgo(0), now).canChange, false);
expect("just changed waits the full window", cooldownState(daysAgo(0), now).daysLeft, NAME_CHANGE_COOLDOWN_DAYS);
expect("a day short is still closed", cooldownState(daysAgo(NAME_CHANGE_COOLDOWN_DAYS - 1), now).canChange, false);
expect("a day short says one day", cooldownState(daysAgo(NAME_CHANGE_COOLDOWN_DAYS - 1), now).daysLeft, 1);
expect("the window is open on the day", cooldownState(daysAgo(NAME_CHANGE_COOLDOWN_DAYS), now).canChange, true);
expect("long past is open", cooldownState(daysAgo(400), now).canChange, true);
expect(
  "the date it opens is the change plus the window",
  cooldownState(daysAgo(10), now).availableAt?.toISOString(),
  daysAgo(10 - NAME_CHANGE_COOLDOWN_DAYS).toISOString()
);

// ── Bank-name nudge ───────────────────────────────────────────────────────────

expect("no bank account, no nudge", bankNameLooksStale("Chidi Nwosu", null), false);
expect("a blank bank account, no nudge", bankNameLooksStale("Chidi Nwosu", "   "), false);
expect("the same name, no nudge", bankNameLooksStale("Chidi Nwosu", "CHIDI NWOSU"), false);
expect("a shared surname reads as the same person", bankNameLooksStale("Chidi Nwosu", "Chidinma Nwosu"), false);
expect("reordered names read as the same person", bankNameLooksStale("Chidi Nwosu", "Nwosu Chidi"), false);
expect("a married surname keeps the first name", bankNameLooksStale("Ngozi Okeke", "Ngozi Nwosu"), false);
expect("nothing in common is nudged", bankNameLooksStale("Chidi Nwosu", "Blessing Okafor"), true);

// ── Wording ───────────────────────────────────────────────────────────────────

const REFUSALS: NameRefusal[] = ["empty", "too_short", "too_long", "one_word", "bad_characters", "reserved", "unchanged"];
for (const reason of REFUSALS) {
  const message = NAME_CHANGE_TEXT.refusal[reason];
  expect(`${reason} has a message`, typeof message === "string" && message.length > 5, true);
  expect(`${reason} is plain for an ambassador`, /ambassadorId|fullName|referralCode|null|undefined|400|500/.test(message), false);
}
expect("the duplicate message exists too", NAME_CHANGE_TEXT.refusal.duplicate.length > 20, true);
expect("the frozen-code promise names the link", /link/i.test(NAME_CHANGE_TEXT.codeFrozen), true);
expect("the frozen-code promise names the code", /referral code/i.test(NAME_CHANGE_TEXT.codeFrozen), true);
expect("one day reads as tomorrow", NAME_CHANGE_TEXT.cooldown(1), "You changed your name recently. You can change it again tomorrow.");
expect("many days are counted", NAME_CHANGE_TEXT.cooldown(12), "You changed your name recently. You can change it again in 12 days.");
expect("the cooldown help names the window", NAME_CHANGE_TEXT.cooldownHelp.includes(String(NAME_CHANGE_COOLDOWN_DAYS)), true);
expect("the bank nudge names the account", NAME_CHANGE_TEXT.bankNudge("Blessing Okafor").includes("Blessing Okafor"), true);
expect("formerly names the old name", NAME_CHANGE_TEXT.formerly("Blessing Okafor"), "Formerly Blessing Okafor");
expect(
  "the HOG is told the code is unchanged",
  NAME_CHANGE_TEXT.hogMessage("Blessing Okafor", "Chidi Nwosu", "EC-A-00045"),
  "Blessing Okafor is now Chidi Nwosu (EC-A-00045). Their referral code and link are unchanged."
);
for (const [key, value] of Object.entries(NAME_CHANGE_TEXT)) {
  if (typeof value !== "string") continue;
  expect(`${key} has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value), false);
}

// ── The limits are the ones the spec names ────────────────────────────────────

expect("the cooldown is 30 days", NAME_CHANGE_COOLDOWN_DAYS, 30);
expect("the letter floor", NAME_MIN_LETTERS, 4);
expect("the length ceiling", NAME_MAX_LENGTH, 60);

if (failures > 0) {
  console.log(`\ncheck:name-change — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:name-change — the ambassador name rules hold.");
