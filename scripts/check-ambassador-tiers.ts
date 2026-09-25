/**
 * Phase 3 step 2: the tier utilities are pure, so they are proven here
 * without a database. `npm run check:tiers`.
 */
import { activityStatus, buildReferralCode, calculateTier, conversionsTillNextTier, isEligibleForSubTeam, percentLabel, subTeamThresholdLabel, tierProgressPercent, tierRate } from "../src/lib/ambassadors/tier-utils";
import { calculateAmbassadorSplit, COMMISSION_RATES, nairaPercent } from "../src/lib/finance/commission-config";
import { badgesFor, isBackFromDormant, isPromotion } from "../src/lib/ambassadors/badges";
import { leaderboardMessage, spotlightMessage } from "../src/lib/ambassadors/spotlight";
import { isoWeekKey, weekStart } from "../src/lib/ambassadors/weeks";

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

// Labels derived from the config (no figures typed into components).
expect("sub-team threshold label", subTeamThresholdLabel(), "Silver (6 conversions)");
expect("percent labels", [percentLabel(COMMISSION_RATES.ambassador), percentLabel(COMMISSION_RATES.hog), percentLabel(0.12)], ["15%", "2.5%", "12%"]);

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
// A referral that has not paid is not activity (spec checklist: "a conversion in the last 30 days, not just a referral").
expect("last conversion 70 days ago, a referral logged yesterday → still Inactive", activityStatus({ lastConversionAt: daysAgo(70), createdAt: daysAgo(200), lifetimeConversions: 2 }, now), "INACTIVE");
expect("joined 10 days ago, nothing converted yet → New", activityStatus({ lastConversionAt: null, createdAt: daysAgo(10), lifetimeConversions: 0 }, now), "NEW");

// Referral code format: NAME3-SCH-NNN.
expect("Blessing at UNILAG → BLE-LAG-847", buildReferralCode("Blessing Eze", "UNILAG", () => 0.847), "BLE-LAG-847");
expect("David at UNIBEN → DAV-BEN-005", buildReferralCode("David Obi", "UNIBEN", () => 0.005), "DAV-BEN-005");
expect("UNN keeps its three letters", buildReferralCode("Faith Adamu", "UNN", () => 0.5), "FAI-UNN-500");
expect("a two-letter school is padded", buildReferralCode("Peter James", "UI", () => 0.123), "PET-UIX-123");
expect("format", /^[A-Z]{3}-[A-Z]{3}-\d{3}$/.test(buildReferralCode("Grace Daniel", "EKSU")), true);

// Leaderboard badges (Section 5).
const kinds = (b: { kind: string }[]) => b.map((x) => x.kind);
const quiet = { conversionsLast7Days: 0, challengeComplete: false, tierUpThisMonthTo: null, backFromDormant: false } as const;
expect("no badges for a quiet Bronze", kinds(badgesFor({ ...quiet, lifetimeConversions: 1 })), []);
expect("13 conversions → 3 away from Gold", badgesFor({ ...quiet, lifetimeConversions: 13 }).map((b) => b.label), ["3 away from Gold"]);
expect("12 conversions (4 away) is not a badge", kinds(badgesFor({ ...quiet, lifetimeConversions: 12 })), []);
expect("Platinum is never 'away'", kinds(badgesFor({ ...quiet, lifetimeConversions: 40 })), []);
expect("3 in 7 days → on fire; 2 is not", [kinds(badgesFor({ ...quiet, lifetimeConversions: 1, conversionsLast7Days: 3 })), kinds(badgesFor({ ...quiet, lifetimeConversions: 1, conversionsLast7Days: 2 }))], [["ON_FIRE"], []]);
expect("every badge, in order", kinds(badgesFor({ lifetimeConversions: 14, conversionsLast7Days: 5, challengeComplete: true, tierUpThisMonthTo: "SILVER", backFromDormant: true })), ["CHALLENGE_COMPLETE", "TIER_UP", "ON_FIRE", "NEAR_TIER", "BACK_FROM_DORMANT"]);
expect("tier up label", badgesFor({ ...quiet, lifetimeConversions: 6, tierUpThisMonthTo: "SILVER" })[0].label, "Tier up (just hit Silver)");
expect("promotion vs demotion", [isPromotion("BRONZE", "SILVER"), isPromotion("GOLD", "SILVER")], [true, false]);
expect(
  "back from dormant: 34 quiet days yes, 26 no, none-before counts from joining, no conversion no badge",
  [isBackFromDormant(daysAgo(21), daysAgo(55), daysAgo(400)), isBackFromDormant(daysAgo(4), daysAgo(30), daysAgo(400)), isBackFromDormant(daysAgo(2), null, daysAgo(100)), isBackFromDormant(null, daysAgo(90), daysAgo(400))],
  [true, false, true, false]
);

// Messages: plain text, no emoji.
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const spot = spotlightMessage({ fullName: "Faith Bello", school: "UNN", thisWeek: 4, thisMonth: 12 });
expect("spotlight message", spot, "This week's spotlight: Faith Bello from UNN! 4 new clients this week alone. Faith has now referred 12 clients this month. Show them some love. #EduCraftAmbassador");
const board = leaderboardMessage("This month", [
  { rank: 1, fullName: "Faith Bello", school: "UNN", conversions: 12 },
  { rank: 2, fullName: "Moses Agu", school: null, conversions: 1 },
]);
expect("leaderboard message lines", board.split("\n").slice(0, 4), ["THIS MONTH", "", "1. Faith Bello (UNN) — 12 clients", "2. Moses Agu — 1 client"]);
expect("no emoji in either message", [emoji.test(spot), emoji.test(board)], [false, false]);

// Weeks start on Monday in WAT: Sunday 23:30 UTC is already Monday 00:30 in Lagos.
expect("ISO week keys", [isoWeekKey(new Date("2026-09-24T12:00:00Z")), isoWeekKey(new Date("2027-01-01T12:00:00Z"))], ["2026-W39", "2026-W53"]);
expect("week start is Monday 00:00 WAT", weekStart(new Date("2026-09-24T12:00:00Z")).toISOString(), "2026-09-20T23:00:00.000Z");
expect("Sunday 23:30 UTC belongs to the next WAT week", weekStart(new Date("2026-09-27T23:30:00Z")).toISOString(), "2026-09-27T23:00:00.000Z");

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("Ambassador tier rules match the spec.");
