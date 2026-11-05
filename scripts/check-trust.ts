/**
 * Checks the worker trust-tier derivation with no database:
 *
 *   npm run check:trust
 *
 * Green / Amber / Red from the dated signals (completed projects up; open flags
 * and projects in revision down), the reason line, and the tier metadata.
 */
import {
  TRUST_GREEN_MIN_COMPLETED,
  TRUST_TIER,
  deriveTrustTier,
  trustTierReason,
  type TrustSignals,
} from "../src/lib/operations/trust-tier";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}
const sig = (o: Partial<TrustSignals> = {}): TrustSignals => ({ completed: 0, openFlags: 0, conductFlags: 0, openRevisions: 0, ...o });

// ── Tier ───────────────────────────────────────────────────────────────────────

expect("a brand-new worker is Amber", deriveTrustTier(sig()), "AMBER");
expect("still proving out (under the threshold) is Amber", deriveTrustTier(sig({ completed: TRUST_GREEN_MIN_COMPLETED - 1 })), "AMBER");
expect("enough clean deliveries, nothing open, is Green", deriveTrustTier(sig({ completed: TRUST_GREEN_MIN_COMPLETED })), "GREEN");
expect("Green holds well above the threshold", deriveTrustTier(sig({ completed: 40 })), "GREEN");
expect("one open flag drops a strong worker to Amber", deriveTrustTier(sig({ completed: 40, openFlags: 1 })), "AMBER");
expect("two open flags are Red", deriveTrustTier(sig({ completed: 40, openFlags: 2 })), "RED");
expect("a conduct flag is Red even alone", deriveTrustTier(sig({ completed: 40, openFlags: 1, conductFlags: 1 })), "RED");
expect("a project in revision drops to Amber", deriveTrustTier(sig({ completed: 40, openRevisions: 1 })), "AMBER");
expect("clean and plenty done but in revision is not Green", deriveTrustTier(sig({ completed: 40, openRevisions: 2 })), "AMBER");

// ── Reason ──────────────────────────────────────────────────────────────────────

expect("new reason", trustTierReason(sig()), "New — no completed projects yet.");
expect("conduct reason wins", trustTierReason(sig({ completed: 40, openFlags: 2, conductFlags: 1 })), "A conduct flag is open.");
expect("two-flag reason", trustTierReason(sig({ completed: 40, openFlags: 2 })), "2 flags are open.");
expect("one-flag reason", trustTierReason(sig({ completed: 40, openFlags: 1 })), "A flag is open.");
expect("revision reason", trustTierReason(sig({ completed: 40, openRevisions: 1 })), "A project is in revision.");
expect("green reason names the record", trustTierReason(sig({ completed: 12 })), "12 clean deliveries, nothing open.");
expect("proving-out reason", trustTierReason(sig({ completed: 3 })), `Still proving out — 3 of ${TRUST_GREEN_MIN_COMPLETED} clean deliveries.`);

// ── Metadata ──────────────────────────────────────────────────────────────────────

for (const tier of ["GREEN", "AMBER", "RED"] as const) {
  expect(`${tier} has a label`, typeof TRUST_TIER[tier].label === "string" && TRUST_TIER[tier].label.length > 0, true);
  expect(`${tier} has a description`, TRUST_TIER[tier].description.length > 10, true);
  expect(`${tier} tone has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(TRUST_TIER[tier].description), false);
}

if (failures > 0) {
  console.log(`\ncheck:trust — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:trust — the trust-tier rules hold.");
