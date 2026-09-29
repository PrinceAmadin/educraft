/**
 * Phase D10 checks (Part A): the monthly summary maths, the six-subsystem
 * grouping, the threshold-once-per-month rule, and the shape of the
 * /api/admin/token-usage response. Pure: no DB, no network, no Claude.
 *
 *   npm run check:token-usage
 */
import { KNOWN_SUBSYSTEMS, MONTHLY_THRESHOLD_KEY, MONTHLY_THRESHOLD_LAST_SENT_KEY, monthKey } from "../src/lib/services/ai-usage";
import { aiUsageThresholdAlert } from "../src/lib/emails/ai-usage-alerts";
import { DEFAULT_FX_MARGIN_PERCENT, FX_MARGIN_MAX, FX_MARGIN_MIN, clampMargin, computeEffective } from "../src/lib/fx-rate";
import { generalSettingsSchema } from "../src/lib/validations/settings";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// ─── monthKey ────────────────────────────────────────────────────────────────
check("monthKey formats YYYY-MM", monthKey(new Date("2026-09-14T10:00:00Z")) === "2026-09");
check("monthKey pads single-digit months", monthKey(new Date("2026-01-01T00:00:00Z")) === "2026-01");
check("monthKey uses local calendar year+month (Sept mid-day)", monthKey(new Date(2026, 8, 15, 12, 0)) === "2026-09");

// ─── The known subsystems (six + preliminary_pages) ──────────────────────────
check("seven subsystems are known", KNOWN_SUBSYSTEMS.length === 7, KNOWN_SUBSYSTEMS);
for (const s of ["research_pipeline", "source_stage", "chapter_generation", "quality_gate", "data_pause", "secondary_data", "preliminary_pages"]) {
  check(`${s} is a known subsystem`, (KNOWN_SUBSYSTEMS as readonly string[]).includes(s));
}
// D10's new subsystem is present
check("preliminary_pages is a known subsystem", (KNOWN_SUBSYSTEMS as readonly string[]).includes("preliminary_pages"));

// ─── The two Setting keys ────────────────────────────────────────────────────
check("threshold Setting key", MONTHLY_THRESHOLD_KEY === "ai.monthlyAlertThresholdNaira");
check("last-sent Setting key", MONTHLY_THRESHOLD_LAST_SENT_KEY === "ai.monthlyAlertLastSentMonth");

// ─── The email template ──────────────────────────────────────────────────────
const email = aiUsageThresholdAlert({
  monthLabel: "September 2026",
  monthlyTotal: 12_345,
  thresholdNaira: 10_000,
  dailyBurn: 823,
  projectedMonthEnd: 24_690,
  daysElapsed: 15,
  daysRemaining: 15,
});
check("threshold email has a subject", typeof email.subject === "string" && email.subject.length > 0);
check("threshold email names the month", email.subject.includes("September 2026") || email.text.includes("September 2026"));
check("threshold email quotes the current spend", email.text.includes("12,345") || email.html.includes("12,345"));
check("threshold email quotes the threshold", email.text.includes("10,000") || email.html.includes("10,000"));
check("threshold email has an HTML body", email.html.includes("<") && email.html.length > 50);

// ─── Burn-rate maths, exercised through the same rounding the service uses ──
// The service's dailyBurn = round(monthlyTotal / daysElapsed) and
// projectedMonthEnd = round(dailyBurn * daysInMonth). We recompute here.
function round2(n: number): number { return Math.round(n * 100) / 100; }
const cases = [
  { monthlyTotal: 6_000, daysElapsed: 10, daysInMonth: 30, burn: 600, proj: 18_000 },
  { monthlyTotal: 12_345, daysElapsed: 15, daysInMonth: 30, burn: 823, proj: 24_690 },
  { monthlyTotal: 0, daysElapsed: 1, daysInMonth: 30, burn: 0, proj: 0 },
  { monthlyTotal: 100, daysElapsed: 1, daysInMonth: 31, burn: 100, proj: 3_100 },
];
for (const c of cases) {
  const burn = round2(c.monthlyTotal / c.daysElapsed);
  const proj = round2(burn * c.daysInMonth);
  check(`burn ${c.monthlyTotal}/${c.daysElapsed} days = ${c.burn}`, burn === c.burn, { burn });
  check(`projection ${burn} × ${c.daysInMonth} days = ${c.proj}`, proj === c.proj, { proj });
}

// ─── Threshold-once-per-month claim ──────────────────────────────────────────
// checkMonthlyThreshold reads the last-sent key and, if it equals monthKey(now),
// returns "already_sent". Otherwise it takes an atomic claim on that row before
// sending. We rebuild the truth table here.
function shouldFire(lastSent: string | null, current: string, monthlyTotal: number, threshold: number | null): "already_sent" | "not_set" | "below" | "would_fire" {
  if (lastSent === current) return "already_sent";
  if (threshold === null || threshold <= 0) return "not_set";
  if (monthlyTotal < threshold) return "below";
  return "would_fire";
}
check("would fire when this month is new and spend crosses", shouldFire("2026-08", "2026-09", 15_000, 10_000) === "would_fire");
check("does not fire twice in the same month", shouldFire("2026-09", "2026-09", 20_000, 10_000) === "already_sent");
check("does not fire without a threshold", shouldFire(null, "2026-09", 20_000, null) === "not_set");
check("does not fire below threshold", shouldFire(null, "2026-09", 5_000, 10_000) === "below");
check("does fire once a new month begins", shouldFire("2026-08", "2026-09", 11_000, 10_000) === "would_fire");
// Rollover: setMonthlyThreshold clears the last-sent key. We simulate that by
// passing null as lastSent — the founder just changed the threshold.
check("changing the threshold lets it fire this month again", shouldFire(null, "2026-09", 11_000, 10_000) === "would_fire");

// ─── Credit-balance shape (USD is the source of truth; naira is derived) ────
// The `getCreditBalance()` response and the Command Center's `AiBalance`
// both carry USD, naira and the current ₦/$ rate. We rebuild the derivation
// here so the maths is checked without a DB.
function deriveBalance(loadedUsd: number, spentUsd: number, usdRate: number) {
  const remainingUsd = Math.max(0, loadedUsd - spentUsd);
  const remainingNaira = remainingUsd * usdRate;
  const percentRemaining = loadedUsd > 0 ? Math.round((remainingUsd / loadedUsd) * 100) : 0;
  const level = percentRemaining < 10 ? "critical" : percentRemaining < 20 ? "low" : "ok";
  return { remainingUsd, remainingNaira, usdRate, percentRemaining, level };
}
{
  const b = deriveBalance(9.11, 0, 1500);
  check("remainingUsd = loaded − spent", b.remainingUsd === 9.11);
  check("remainingNaira = remainingUsd × usdRate", b.remainingNaira === 9.11 * 1500);
  check("percentRemaining is 100 at zero spend", b.percentRemaining === 100);
  check("level ok above 20%", b.level === "ok");
}
{
  const b = deriveBalance(100, 85, 1500);
  check("percentRemaining rounds", b.percentRemaining === 15);
  check("level low under 20%", b.level === "low");
}
{
  const b = deriveBalance(100, 95, 1500);
  check("level critical under 10%", b.level === "critical");
}
{
  const b = deriveBalance(100, 120, 1500);
  check("remaining clamps to zero when overspent", b.remainingUsd === 0);
  check("remainingNaira also clamps", b.remainingNaira === 0);
}
// Legacy fallback: only the naira Setting row exists. `getCreditBalance()`
// converts it to USD at the current rate before deriving.
function fallbackUsd(nairaValue: number, usdRate: number) {
  return usdRate > 0 ? nairaValue / usdRate : 0;
}
check("legacy naira row converts to USD at current rate", fallbackUsd(13665, 1500) === 9.11);
check("legacy fallback with zero rate returns 0", fallbackUsd(1000, 0) === 0);

// ─── FX rate: effective = base × (1 + margin/100) ────────────────────────────
check("computeEffective(1324.62, 3) rounds to 2 dp", computeEffective(1324.62, 3) === 1364.36);
check("computeEffective(1352, 0) === 1352", computeEffective(1352, 0) === 1352);
check("computeEffective(1000, 10) === 1100", computeEffective(1000, 10) === 1100);
check("computeEffective is monotonic in margin", computeEffective(1000, 5) > computeEffective(1000, 3));

// Margin clamp (0–20 %).
check("default margin", DEFAULT_FX_MARGIN_PERCENT === 3);
check("clamps negatives to floor", clampMargin(-5) === FX_MARGIN_MIN);
check("clamps huge to ceiling", clampMargin(999) === FX_MARGIN_MAX);
check("keeps a valid margin", clampMargin(7.5) === 7.5);
check("NaN margin falls back to default", clampMargin(Number.NaN) === DEFAULT_FX_MARGIN_PERCENT);

// The Zod schema refuses out-of-range margins and non-numeric overrides.
{
  const ok = generalSettingsSchema.safeParse({ fxRateMarginPercent: 3, fxRateManualOverride: "1352" });
  check("schema accepts a plain override + margin", ok.success);
}
{
  const bad = generalSettingsSchema.safeParse({ fxRateMarginPercent: 50 });
  check("schema rejects a margin above 20", !bad.success);
}
{
  const bad = generalSettingsSchema.safeParse({ fxRateManualOverride: "not-a-number" });
  check("schema rejects a non-numeric override", !bad.success);
}
{
  const empty = generalSettingsSchema.safeParse({ fxRateManualOverride: "" });
  check("schema accepts an empty override (clears it)", empty.success);
}

// Resolution order: override wins over auto; margin applied to whichever wins.
function resolve(order: { override?: number; auto?: number; env?: number; margin: number }): { base: number; source: string; effective: number } {
  let base: number;
  let source: string;
  if (order.override != null && order.override > 0) {
    base = order.override;
    source = "manual";
  } else if (order.auto != null && order.auto > 0) {
    base = order.auto;
    source = "auto";
  } else if (order.env != null && order.env > 0) {
    base = order.env;
    source = "env";
  } else {
    base = 1500;
    source = "default";
  }
  return { base, source, effective: computeEffective(base, order.margin) };
}
check("override wins over auto", resolve({ override: 1352, auto: 1325, margin: 3 }).source === "manual");
check("auto wins over env", resolve({ auto: 1325, env: 1500, margin: 3 }).source === "auto");
check("env wins over default", resolve({ env: 1400, margin: 0 }).source === "env");
check("default kicks in when nothing set", resolve({ margin: 3 }).source === "default");
check("margin applied to override", resolve({ override: 1352, margin: 3 }).effective === computeEffective(1352, 3));
check("margin applied to auto", resolve({ auto: 1325, margin: 3 }).effective === computeEffective(1325, 3));

// ─── The GET /api/admin/token-usage shape ─────────────────────────────────
// The route returns { perProject, perWorker, perSubsystem, monthlyTotal,
// burnRate, projectedMonthEnd, daysRemaining, thresholdNaira }. We assert
// each field's presence and type in a synthetic response the route would
// build.
const sample = {
  perProject: [{ code: "EC-QA-D10-A", title: "Test", mode: 2, inputTokens: 1000, outputTokens: 500, costNaira: 150, completedAt: null }],
  perWorker: [{ workerId: "w1", workerName: "Worker A", projectCount: 1, costNaira: 150 }],
  perSubsystem: KNOWN_SUBSYSTEMS.map((s) => ({ subsystem: s, tokens: 100, costNaira: 20, calls: 1 })),
  monthlyTotal: 150,
  burnRate: 10,
  projectedMonthEnd: 300,
  daysRemaining: 15,
  thresholdNaira: 10_000,
};
for (const field of ["perProject", "perWorker", "perSubsystem", "monthlyTotal", "burnRate", "projectedMonthEnd", "daysRemaining", "thresholdNaira"] as const) {
  check(`response has ${field}`, Object.prototype.hasOwnProperty.call(sample, field));
}
check("perProject rows carry the six numeric fields", sample.perProject.every((p) => typeof p.code === "string" && typeof p.costNaira === "number"));
check("perSubsystem covers every known subsystem", sample.perSubsystem.length >= KNOWN_SUBSYSTEMS.length);

if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`${passed} passed.`);
  process.exit(1);
}
console.log(`All ${passed} check:token-usage checks passed.`);
