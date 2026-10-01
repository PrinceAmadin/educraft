/**
 * Fails when a commission figure or HQ contact detail is hardcoded where the
 * published cashflow structure (or the HQ contact settings) should be read.
 *
 *   npm run check:cashflow-static
 *
 * Four rules, on src/ with comments and import lines ignored:
 *   1. The default structure (`DEFAULT_CASHFLOW`, cashflow-default.ts) is
 *      imported only by scripts — never a runtime fallback.
 *   2. The names the rebuild deleted never come back.
 *   3. The manual's percentages never appear as literals in the money code.
 *   4. The HQ WhatsApp number and mailbox appear only where they are the
 *      sender or a technical contact (the keep-list).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function files(path: string): string[] {
  const full = join(ROOT, path);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return /\.(ts|tsx)$/.test(full) ? [full] : [];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const rel = (file: string) => relative(ROOT, file).replace(/\\/g, "/");

let problems = 0;
function problem(file: string, line: number, text: string) {
  problems++;
  console.log(`${rel(file)}:${line}: ${text}`);
}

const src = files("src");

// 1. DEFAULT_CASHFLOW is for scripts only.
for (const file of src) {
  const lines = readFileSync(file, "utf-8").split("\n");
  lines.forEach((line, i) => {
    if (/cashflow-default|DEFAULT_CASHFLOW/.test(line) && !rel(file).startsWith("src/lib/finance/cashflow-default.ts")) {
      problem(file, i + 1, "the default structure is only for the seed and the checks, never a runtime fallback");
    }
  });
}

// 2. Deleted names.
const DELETED = /\b(COMMISSION_RATES|AMBASSADOR_TIERS|TIER_COMMISSION_RATE|WORKER_PAYOUT_RATE|DOWNPAYMENT_PERCENTAGE|TIER_LADDER|getCommissionRates|getDefaultParentCommissionRate|DEFAULT_PARENT_COMMISSION_RATE|PLATINUM_QUARTERLY_BONUS_PER_CLIENT|QUARTERLY_CHALLENGE|STANDARD_RETAINED_RATE|EDUCRAFT_WHATSAPP|EDUCRAFT_WHATSAPP_URL)\b/;
for (const file of src) {
  const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
  lines.forEach((line, i) => {
    if (DELETED.test(line)) problem(file, i + 1, `deleted name: ${DELETED.exec(line)![1]}`);
  });
}

// 3. The manual's figures as literals, in the money code.
const MONEY_FILES = [
  ...files("src/lib/finance").filter((f) => !/cashflow-default\.ts$/.test(f)),
  ...files("src/lib/services/finance"),
  ...files("src/lib/services/ambassador-platform"),
  "src/lib/services/ambassador-commission.ts",
  "src/lib/services/ambassadors.ts",
  "src/lib/services/ambassador-portal.ts",
  "src/lib/pricing.ts",
  "src/lib/constants.ts",
  "src/lib/commission.ts",
  "src/lib/ambassador.ts",
  "src/lib/ambassadors/tier-utils.ts",
  "src/lib/services/projects.ts",
  "src/lib/services/intake.ts",
].flatMap((f) => (f.includes("\\") || f.startsWith(ROOT) ? [f] : files(f)));
const LITERALS = /(?<![\w.])(0\.375|0\.175|0\.275|37\.5|17\.5|27\.5|0\.025|workerPayoutRate:\s*40)(?![\w.])/;
for (const file of MONEY_FILES) {
  const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
  lines.forEach((line, i) => {
    if (/^\s*import\b/.test(line)) return;
    const m = LITERALS.exec(line);
    if (m) problem(file, i + 1, `the manual's figure ${m[1]} typed into money code — read it from the structure`);
  });
}

// 4. HQ contact details outside the keep-list.
const KEEP = [
  "src/lib/mailer.ts", // the sending mailbox
  "src/lib/services/settings.ts", // the shipped defaults of the Setting rows
  "src/lib/services/hq-contact.ts", // the shipped defaults of the Setting rows
  "src/lib/openalex.ts", // research technical contacts
  "src/lib/unpaywall.ts",
  "src/lib/research/sources/http.ts",
  "src/lib/data-fetchers/timed-fetch.ts",
  "src/lib/services/push.ts", // VAPID subject
  "src/lib/services/ambassador-weekly-report.ts", // List-Unsubscribe mailto (the sender mailbox)
  "src/components/settings/GeneralSettingsForm.tsx", // the hint about the sender
  "src/lib/executive-identity.ts", // the founder's identity
];
const CONTACT = /(2347063421088|07063421088|educraft611@gmail\.com)/;
for (const file of src) {
  if (KEEP.some((k) => rel(file) === k)) continue;
  const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
  lines.forEach((line, i) => {
    if (CONTACT.test(line)) problem(file, i + 1, `HQ contact detail typed in — read it from the HQ contact settings`);
  });
}

// 5. Audit coverage (Phase 8): every cashflow structure / money-policy mutation writes a CashflowAuditLog action.
const AUDITED: { file: string; fn: string; action: string }[] = [
  { file: "src/lib/services/cashflow.ts", fn: "publishCashflow", action: "published_version" },
  { file: "src/lib/services/settings.ts", fn: "updateGeneralSettings", action: "changed_hq_contact" },
  { file: "src/lib/services/finance/buckets.ts", fn: "manualAdjustment", action: "bucket_adjustment" },
  { file: "src/lib/services/finance/refunds.ts", fn: "processRefund", action: "processed_refund" },
  { file: "src/lib/services/finance/cashflow-tick.ts", fn: "runCashflowTick", action: "CRON_FAILURE" },
];
for (const a of AUDITED) {
  const full = join(ROOT, a.file);
  if (!statSync(full, { throwIfNoEntry: false })) {
    problem(full, 0, `audit-coverage: ${a.file} is missing — the check is out of date`);
    continue;
  }
  const source = stripComments(readFileSync(full, "utf-8"));
  if (!new RegExp(`function ${a.fn}\\b`).test(source)) problem(full, 0, `audit-coverage: ${a.fn} not found — update the check`);
  else if (!source.includes("cashflowAuditLog.create")) problem(full, 0, `audit-coverage: ${a.fn} must write a CashflowAuditLog row`);
  else if (!source.includes(`"${a.action}"`)) problem(full, 0, `audit-coverage: ${a.file} should record the action "${a.action}"`);
}

if (problems) {
  console.log(`\n${problems} place(s) still hardcode a cashflow figure or an HQ contact detail, or miss an audit row.`);
  process.exit(1);
}
console.log("No hardcoded cashflow figures or HQ contact details outside the keep-list; cashflow mutations are audited.");
