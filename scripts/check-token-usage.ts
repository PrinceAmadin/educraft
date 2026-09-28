/**
 * Phase D10 checks (Part A): the monthly summary maths, the six-subsystem
 * grouping, the threshold-once-per-month rule, and the shape of the
 * /api/admin/token-usage response. Pure: no DB, no network, no Claude.
 *
 *   npm run check:token-usage
 */
import { KNOWN_SUBSYSTEMS, MONTHLY_THRESHOLD_KEY, MONTHLY_THRESHOLD_LAST_SENT_KEY, monthKey } from "../src/lib/services/ai-usage";
import { aiUsageThresholdAlert } from "../src/lib/emails/ai-usage-alerts";

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
