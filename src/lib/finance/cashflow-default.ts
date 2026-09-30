import type { CashflowStructure } from "@/lib/finance/cashflow-types";

/**
 * Cashflow version 1: the numbers of `EduCraft Cashflow & Commission
 * Structure v2.0` (September 2026). This is the ONLY file that holds them.
 * The seed publishes it as v1 and the check scripts prove the maths against
 * it; nothing at runtime falls back to it — money is always computed from a
 * published version.
 */
export const DEFAULT_CASHFLOW: CashflowStructure = {
  schemaVersion: 1,
  level1: [
    { key: "workers", label: "Workers", percentage: 40, displayOrder: 1, kind: "person", recipients: "workers", trigger: "completion" },
    { key: "ambassador", label: "Ambassador", percentage: 15, displayOrder: 2, kind: "person", recipients: "ambassadors", trigger: "downpayment", note: "EduCraft always pays this much in total: the referrer's tier rate, the rest to their Core." },
    { key: "hog", label: "Head of Growth", percentage: 2.5, displayOrder: 3, kind: "person", recipients: "role", role: "HOG", trigger: "completion", condition: "ambassador_driven" },
    { key: "coo", label: "COO", percentage: 2.5, displayOrder: 4, kind: "person", recipients: "role", role: "COO", trigger: "completion" },
    // Inactive rows are left out of the 100% sum: switching this on (Year 2) makes the total 102% and the absorber gives the 2% up.
    { key: "growth_associate", label: "Growth Associate", percentage: 2, displayOrder: 5, kind: "person", recipients: "user", assignedUserId: null, trigger: "completion", active: false, note: "Year 2: 2% from the retained share once active." },
    { key: "educraft_retained", label: "EduCraft retains", percentage: 40, displayOrder: 6, kind: "fund", isAbsorber: true },
  ],
  level2: [
    { key: "OPERATIONS_RESERVE", label: "Operations Reserve", percentage: 37.5, holder: "CFO", purpose: "Platform costs, Claude API, software, emergencies" },
    { key: "GROWTH_FUND", label: "Growth Fund", percentage: 17.5, holder: "HOG spends, CFO tracks", purpose: "Ambassador bonuses, sponsorships, school entry" },
    { key: "REINVESTMENT_FUND", label: "Reinvestment Fund", percentage: 17.5, holder: "CEO directs, CFO holds", purpose: "Platform development, new services, equipment, legal", isAbsorber: true },
    { key: "FOUNDER_DISTRIBUTION", label: "Founder Distribution", percentage: 27.5, holder: "CEO + CFO 50/50", purpose: "CEO and Co-CEO/CFO monthly draws and bonuses" },
  ],
  level3: [
    { key: "claude_api", label: "Claude API", parentKey: "OPERATIONS_RESERVE", percentage: 40, isTrackedAsPot: true, description: "Read into the AI usage tab" },
    { key: "data", label: "Data pot", parentKey: "OPERATIONS_RESERVE", percentage: 20, isTrackedAsPot: true, description: "Hosting, database" },
    { key: "software", label: "Software pot", parentKey: "OPERATIONS_RESERVE", percentage: 15, isTrackedAsPot: true, description: "Vercel, domains, email" },
    { key: "emergencies", label: "Emergencies", parentKey: "OPERATIONS_RESERVE", percentage: 25, isTrackedAsPot: true, isAbsorber: true, description: "Buffer" },
  ],
  tiers: [
    { key: "BRONZE", minConversions: 0, maxConversions: 5, ratePercent: 10 },
    { key: "SILVER", minConversions: 6, maxConversions: 15, ratePercent: 12 },
    { key: "GOLD", minConversions: 16, maxConversions: 30, ratePercent: 15 },
    { key: "PLATINUM", minConversions: 31, maxConversions: null, ratePercent: 15 },
  ],
  bonuses: [
    { key: "hog_activation", recipient: "hog", label: "Ambassador activation rate above 30% in a month", condition: "Ambassador activation rate above 30%", amountNgn: 50_000, cadence: "monthly", metric: { key: "activationRate", op: ">", value: 30 } },
    { key: "hog_new_school", recipient: "hog", label: "A new school reaches 10+ active clients", condition: "New school to 10+ active clients", amountNgn: 30_000, cadence: "monthly" },
    { key: "hog_challenge", recipient: "hog", label: "Per ambassador completing the quarterly challenge", condition: "Per ambassador completing the quarterly challenge", amountNgn: 10_000, cadence: "quarterly" },
    { key: "hog_client_target", recipient: "hog", label: "New client target exceeded by more than 20%", condition: "New client target exceeded by > 20%", amountNgn: 75_000, cadence: "monthly" },
    { key: "coo_qa", recipient: "coo", label: "QA first-pass rate above 85% in a month", condition: "QA first-pass rate above 85%", amountNgn: 30_000, cadence: "monthly", metric: { key: "qaFirstPassRate", op: ">", value: 85 } },
    { key: "coo_on_time", recipient: "coo", label: "On-time delivery rate above 97%", condition: "On-time delivery rate above 97%", amountNgn: 30_000, cadence: "monthly", metric: { key: "onTimeRate", op: ">", value: 97 } },
    { key: "coo_zero_rejections", recipient: "coo", label: "Zero supervisor rejections in a month", condition: "Zero supervisor rejections", amountNgn: 50_000, cadence: "monthly", metric: { key: "supervisorRejections", op: "==", value: 0 } },
    { key: "coo_satisfaction", recipient: "coo", label: "Client satisfaction above 90% positive", condition: "Client satisfaction > 90% positive", amountNgn: 25_000, cadence: "monthly" },
    { key: "platinum_per_client", recipient: "platinum_ambassador", label: "Platinum quarterly bonus, per client referred", condition: "Per client referred in the quarter, Platinum only", amountNgn: 3_000, cadence: "quarterly", perClient: true },
    { key: "quarterly_challenge", recipient: "any_ambassador", label: "Quarterly challenge: 10 or more clients in the quarter", condition: "10+ paying clients referred in the quarter", amountNgn: 35_000, cadence: "quarterly", target: 10, extensionDays: 7 },
  ],
  founderDrawTiers: [
    { minRevenueNgn: 0, maxRevenueNgn: 499_999, drawPerFounderNgn: 0 },
    { minRevenueNgn: 500_000, maxRevenueNgn: 999_999, drawPerFounderNgn: 25_000 },
    { minRevenueNgn: 1_000_000, maxRevenueNgn: 2_499_999, drawPerFounderNgn: 75_000 },
    { minRevenueNgn: 2_500_000, maxRevenueNgn: 4_999_999, drawPerFounderNgn: 150_000 },
    { minRevenueNgn: 5_000_000, maxRevenueNgn: 9_999_999, drawPerFounderNgn: 300_000 },
    { minRevenueNgn: 10_000_000, maxRevenueNgn: null, drawPerFounderNgn: 500_000 },
  ],
  triggers: { downpaymentPercent: 45, bufferPercent: 10 },
};
