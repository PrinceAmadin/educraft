/**
 * Phase 3 step 2: the tier utilities are pure, so they are proven here
 * without a database. `npm run check:tiers`.
 */
import { activityStatus, buildReferralCode, calculateTier, conversionsTillNextTier, isEligibleForSubTeam, tierProgressPercent, tierRate } from "../src/lib/ambassadors/tier-utils";
import { calculateAmbassadorSplit, COMMISSION_RATES, nairaPercent } from "../src/lib/finance/commission-config";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// Thresholds from the spec: 0–5 Bronze, 6–15 Silver, 16–30 Gold, 31+ Platinum.
for (const [n, tier] of [
  [0, "BRONZE"], [5, "BRONZE"], [6, "SILVER"], [15, "SILVER"], [16, "GOLD"], [30, "GOLD"], [31, "PLATINUM"], [200, "PLATINUM"], [-3, "BRONZE"],
] as const) {
  expect(`calculateTier(${n})`, calculateTier(n), tier);
}
expect("rates follow the config", [tierRate("BRONZE"), tierRate("SILVER"), tierRate("GOLD"), tierRate("PLATINUM")], [0.1, 0.12, 0.15, 0.15]);

// Distance to the next tier.
for (const [n, left] of [[0, 6], [5, 1], [6, 10], [15, 1], [16, 15], [30, 1], [31, null], [40, null]] as const) {
  expect(`conversionsTillNextTier(${n})`, conversionsTillNextTier(n), left);
}
expect("progress through Bronze at 3", tierProgressPercent(3), 50);
expect("progress at Platinum", tierProgressPercent(31), 100);

// Sub-teams from Silver up.
expect("Bronze cannot activate a sub-team", isEligibleForSubTeam("BRONZE"), false);
expect("Silver can", isEligibleForSubTeam("SILVER"), true);
expect("Gold can", isEligibleForSubTeam("GOLD"), true);
expect("Platinum can", isEligibleForSubTeam("PLATINUM"), true);

// The 15% rule, from the same config the payout engine uses.
for (const [subTier, subPct, corePct] of [["BRONZE", 10, 5], ["SILVER", 12, 3], ["GOLD", 15, 0], ["PLATINUM", 15, 0]] as const) {
  const split = calculateAmbassadorSplit(tierRate(subTier));
  expect(`sub at ${subTier}: sub ${subPct}% + core ${corePct}% = 15%`, [Math.round(split.subRate * 100), Math.round(split.coreOverride * 100)], [subPct, corePct]);
  expect(`sub at ${subTier}: total is 15%`, Math.round((split.subRate + split.coreOverride) * 100), Math.round(COMMISSION_RATES.ambassador * 100));
}
expect("Bronze sub on ₦70,000: sub ₦7,000 + core ₦3,500 = ₦10,500", [nairaPercent(70000, 0.1), nairaPercent(70000, 0.05), nairaPercent(70000, 0.1) + nairaPercent(70000, 0.05)], [7000, 3500, 10500]);
expect("Gold sub on ₦70,000: sub ₦10,500 + core ₦0", [nairaPercent(70000, 0.15), nairaPercent(70000, 0)], [10500, 0]);

// Activity from dates.
const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
expect("conversion 3 days ago → Active", activityStatus({ lastConversionAt: daysAgo(3), createdAt: daysAgo(200), lifetimeConversions: 4 }, now), "ACTIVE");
expect("conversion 45 days ago → Dormant", activityStatus({ lastConversionAt: daysAgo(45), createdAt: daysAgo(200), lifetimeConversions: 4 }, now), "DORMANT");
expect("conversion 61 days ago → Inactive", activityStatus({ lastConversionAt: daysAgo(61), createdAt: daysAgo(200), lifetimeConversions: 4 }, now), "INACTIVE");
expect("joined 10 days ago, nothing yet → New", activityStatus({ lastConversionAt: null, createdAt: daysAgo(10), lifetimeConversions: 0 }, now), "NEW");
expect("joined 90 days ago, nothing ever → Inactive", activityStatus({ lastConversionAt: null, createdAt: daysAgo(90), lifetimeConversions: 0 }, now), "INACTIVE");

// Referral code format: NAME3-SCH-NNN.
expect("Blessing at UNILAG → BLE-LAG-847", buildReferralCode("Blessing Eze", "UNILAG", () => 0.847), "BLE-LAG-847");
expect("David at UNIBEN → DAV-BEN-005", buildReferralCode("David Obi", "UNIBEN", () => 0.005), "DAV-BEN-005");
expect("UNN keeps its three letters", buildReferralCode("Faith Adamu", "UNN", () => 0.5), "FAI-UNN-500");
expect("a two-letter school is padded", buildReferralCode("Peter James", "UI", () => 0.123), "PET-UIX-123");
expect("format", /^[A-Z]{3}-[A-Z]{3}-\d{3}$/.test(buildReferralCode("Grace Daniel", "EKSU")), true);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("Ambassador tier rules match the spec.");
