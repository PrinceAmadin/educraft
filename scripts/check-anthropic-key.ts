/**
 * The Anthropic API key as an admin setting (24 Nov 2026). Proves, with no
 * database, no network and no Claude:
 *
 *  - the masked hint never reveals more than the documented prefix and the
 *    last four characters, and a short string is not accidentally exposed;
 *  - the shape check accepts a real key and refuses the paste mistakes that
 *    actually happen (quotes, a space, a newline, a truncated copy, the
 *    placeholder from the Console);
 *  - seal → open round-trips, the blob never contains the key, two seals of
 *    the same key differ (random IV), and open() returns null — never throws —
 *    for junk, a tampered auth tag, a truncated blob and a blob sealed under a
 *    different AUTH_SECRET (a rotated secret must degrade, not crash);
 *  - the status shape the screens render carries no field that could hold the
 *    key itself;
 *  - a status Anthropic answers with settles the key's fate the right way:
 *    every 4xx bar 408/429 refuses the SAVE (26 Nov 2026 — an account key
 *    that answers 400 had been saved unverified, and once saved it beat the
 *    environment variable and took every Claude call in HQ down), while a
 *    5xx or a throttle leaves the key saved but unverified.
 *
 * `npm run check:anthropic-key`.
 */
import { anthropicRefusedKey, keyHint, looksLikeAnthropicKey, type AnthropicKeyStatus } from "../src/lib/anthropic-key";
import { isSealed, openSecret, resetSecretBoxKey, sealSecret } from "../src/lib/secret-box";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** Shaped like a real key: sk-ant-api03- plus ~95 url-safe characters. */
const REAL = `sk-ant-api03-${"aB3_x-Z9".repeat(11)}9fQa`;

// ── The masked hint ────────────────────────────────────────────
process.env.AUTH_SECRET = "check-anthropic-key-secret-one";
resetSecretBoxKey();

const hint = keyHint(REAL);
eq("hint keeps the leading 12 characters", hint.slice(0, 12), REAL.slice(0, 12));
eq("hint ends with the last 4", hint.slice(-4), REAL.slice(-4));
check("hint has the ellipsis between them", hint.includes("…"));
check("hint is far shorter than the key", hint.length < 20, `hint ${hint.length}, key ${REAL.length}`);
check("hint never contains the whole key", !hint.includes(REAL));
// The body of the key must not leak: nothing from the middle appears in the hint.
check("hint reveals nothing from the middle", !hint.includes(REAL.slice(20, 40)));
eq("a short string is masked, not shown", keyHint("sk-ant-short"), "sk-a…");
eq("an empty key has no hint", keyHint(""), "");
eq("hint trims whitespace first", keyHint(`  ${REAL}  `), hint);

// ── The shape check ────────────────────────────────────────────
check("accepts a real-looking key", looksLikeAnthropicKey(REAL));
check("accepts one with stray whitespace around it", looksLikeAnthropicKey(`\n  ${REAL}\t`));
check("refuses an empty string", !looksLikeAnthropicKey(""));
check("refuses the wrong prefix", !looksLikeAnthropicKey(`sk-proj-${"a".repeat(40)}`));
check("refuses a key with a space in the middle", !looksLikeAnthropicKey(`sk-ant-api03-${"a".repeat(20)} ${"b".repeat(20)}`));
check("refuses a key with a newline in the middle", !looksLikeAnthropicKey(`sk-ant-api03-${"a".repeat(20)}\n${"b".repeat(20)}`));
check("refuses a quoted paste", !looksLikeAnthropicKey(`"${REAL}"`));
check("refuses a truncated copy", !looksLikeAnthropicKey("sk-ant-api"));
check("refuses something absurdly long", !looksLikeAnthropicKey(`sk-ant-${"a".repeat(500)}`));

// ── Seal and open ──────────────────────────────────────────────
const sealed = sealSecret(REAL);
check("a sealed blob is recognised as one", isSealed(sealed));
eq("the blob is versioned v1", sealed.split(":")[0], "v1");
eq("the blob has four parts", sealed.split(":").length, 4);
check("the blob does NOT contain the key", !sealed.includes(REAL));
check("the blob does not contain the key's tail", !sealed.includes(REAL.slice(-16)));
eq("open round-trips the key", openSecret(sealed), REAL);
check("two seals of one key differ (random IV)", sealSecret(REAL) !== sealSecret(REAL));
eq("both seals still open to the key", openSecret(sealSecret(REAL)), REAL);

// Failures must be null, never a throw.
for (const [label, value] of [
  ["null", null],
  ["undefined", undefined],
  ["an empty string", ""],
  ["plain text", REAL],
  ["a bare word", "nonsense"],
  ["the wrong version", sealed.replace(/^v1/, "v9")],
  ["too few parts", sealed.split(":").slice(0, 3).join(":")],
  ["a non-base64 body", "v1:!!!:!!!:!!!"],
] as const) {
  let threw = false;
  let got: string | null = "unset";
  try {
    got = openSecret(value as string | null | undefined);
  } catch {
    threw = true;
  }
  check(`open(${label}) returns null without throwing`, !threw && got === null, threw ? "threw" : `got ${JSON.stringify(got)}`);
}
check("isSealed is false for plain text", !isSealed(REAL));

// A tampered auth tag must fail the GCM check.
{
  const parts = sealed.split(":");
  const tag = Buffer.from(parts[2], "base64");
  tag[0] = tag[0] ^ 0xff;
  const tampered = [parts[0], parts[1], tag.toString("base64"), parts[3]].join(":");
  eq("a tampered auth tag fails to open", openSecret(tampered), null);
}
// A tampered ciphertext too.
{
  const parts = sealed.split(":");
  const body = Buffer.from(parts[3], "base64");
  body[0] = body[0] ^ 0xff;
  const tampered = [parts[0], parts[1], parts[2], body.toString("base64")].join(":");
  eq("a tampered ciphertext fails to open", openSecret(tampered), null);
}

// A rotated AUTH_SECRET must degrade to null, so the resolver falls back to the env var.
process.env.AUTH_SECRET = "check-anthropic-key-secret-two";
resetSecretBoxKey();
eq("a blob sealed under the old secret opens to null", openSecret(sealed), null);
eq("a fresh seal under the new secret still works", openSecret(sealSecret(REAL)), REAL);
process.env.AUTH_SECRET = "check-anthropic-key-secret-one";
resetSecretBoxKey();
eq("back on the old secret, the original blob opens again", openSecret(sealed), REAL);

// ── Whose verdict a status is ──────────────────────────────────
// Anthropic saying no must refuse the save; Anthropic being unable to answer
// must not, or an outage would lock the founder out of changing his own key.
check("401 is a refusal (wrong or revoked key)", anthropicRefusedKey(401));
check("403 is a refusal", anthropicRefusedKey(403));
check("400 is a refusal — an account key, not a workspace key", anthropicRefusedKey(400));
check("404 is a refusal", anthropicRefusedKey(404));
check("422 is a refusal", anthropicRefusedKey(422));
check("408 is NOT a refusal (ask again)", !anthropicRefusedKey(408));
check("429 is NOT a refusal (throttled, ask again)", !anthropicRefusedKey(429));
check("500 is NOT a refusal (save unverified)", !anthropicRefusedKey(500));
check("502 is NOT a refusal", !anthropicRefusedKey(502));
check("529 (Anthropic overloaded) is NOT a refusal", !anthropicRefusedKey(529));
check("200 is not a refusal", !anthropicRefusedKey(200));
check("no 5xx is ever a refusal", ![500, 501, 502, 503, 504, 520, 529].some(anthropicRefusedKey));
check(
  "every 4xx except 408 and 429 is a refusal",
  Array.from({ length: 100 }, (_, i) => 400 + i)
    .filter((s) => s !== 408 && s !== 429)
    .every(anthropicRefusedKey),
);

// ── The status the screens render ──────────────────────────────
// Compile-time: every field of AnthropicKeyStatus, so a new one must be listed here
// and judged. Run-time: none of them may be named like the key itself.
const STATUS_FIELDS: Record<keyof AnthropicKeyStatus, true> = {
  source: true,
  hint: true,
  setAt: true,
  setByName: true,
  verifiedAt: true,
  hasSavedKey: true,
  unreadable: true,
  hasEnvFallback: true,
};
const names = Object.keys(STATUS_FIELDS);
eq("the status has exactly the eight known fields", names.length, 8);
check(
  "no status field is named like the key itself",
  !names.some((n) => /^(key|apiKey|sealed|secret|plain|value)$/i.test(n)),
  names.join(", "),
);
check("the status carries a masked hint, not a key", names.includes("hint") && !names.includes("key"));

if (failures.length) {
  console.error(`check:anthropic-key — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:anthropic-key — all ${passed} checks passed`);
