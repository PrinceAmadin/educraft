import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FolderKanban, Users, Wallet, MousePointerClick, Trophy, User } from "lucide-react";
import { adminHomeForRole, adminMobileNavForRole, adminNavForRole } from "@/lib/sidebar-config";

export const APP_NAME = "EduCraft WorkBase";
export const BRAND_NAME = "EduCraft";

/** Business rules from the blueprint. */
export const DOWNPAYMENT_PERCENTAGE = 45;
export const WORKER_PAYOUT_RATE = 40;
export const MAX_REVISIONS = 3;
export const ANNUAL_REVENUE_TARGET = 1_000_000_000;

export const AMBASSADOR_TIERS = [
  { tier: "BRONZE", min: 0, max: 5, rate: 10 },
  { tier: "SILVER", min: 6, max: 15, rate: 12 },
  { tier: "GOLD", min: 16, max: 30, rate: 15 },
  { tier: "PLATINUM", min: 31, max: Infinity, rate: 15 },
] as const;

/** Commission rate (%) for an ambassador tier. */
export const TIER_COMMISSION_RATE: Record<string, number> = {
  BRONZE: 10,
  SILVER: 12,
  GOLD: 15,
  PLATINUM: 15,
};

/** Academic levels for client profiles and intake. */
/** Commission payout banks — shown on the ambassador application's payment step. */
export const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Coronation Merchant Bank",
  "Ecobank Nigeria",
  "FBNQuest Merchant Bank",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Greenwich Merchant Bank",
  "Guaranty Trust Bank (GTBank)",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda Bank",
  "Moniepoint Microfinance Bank",
  "Nova Merchant Bank",
  "Opay",
  "PalmPay",
  "Parallex Bank",
  "Polaris Bank",
  "PremiumTrust Bank",
  "Providus Bank",
  "Rand Merchant Bank",
  "Rubies Microfinance Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank Nigeria",
  "Sterling Bank",
  "SunTrust Bank Nigeria",
  "TAJ Bank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "VFD Microfinance Bank",
  "Wema Bank",
  "Zenith Bank",
].sort();

export const ACADEMIC_LEVELS = [
  "100 Level",
  "200 Level",
  "300 Level",
  "400 Level",
  "500 Level",
  "600 Level",
  "Postgraduate",
  "Graduate / Alumni",
] as const;

/**
 * Ambassador application screening.
 *
 * The form used to end on "why do you want to be an ambassador?", which asks
 * for intent — free to claim, so every answer came back as the same three
 * words. These ask instead for what can be checked: roles actually held,
 * students actually reachable, and one piece of the real work.
 */
export const REACH_ROLES = [
  { value: "COURSE_REP", label: "Course rep or class governor" },
  { value: "GROUP_ADMIN", label: "Admin of a department, level or class WhatsApp group" },
  { value: "ASSOC_EXEC", label: "Executive in a departmental or faculty association" },
  { value: "CAMPUS_PAGE", label: "I run a page or account students on my campus follow" },
  { value: "CLUB_ACTIVE", label: "Active in a campus fellowship, club or society" },
  { value: "NONE", label: "None of these yet" },
] as const;

/** The roles that actually put a message in front of people. */
export const DISTRIBUTION_ROLES = ["COURSE_REP", "GROUP_ADMIN", "ASSOC_EXEC", "CAMPUS_PAGE"] as const;

export const REACH_SIZES = [
  { value: "UNDER_50", label: "Fewer than 50" },
  { value: "R50_150", label: "50 to 150" },
  { value: "R150_400", label: "150 to 400" },
  { value: "OVER_400", label: "More than 400" },
] as const;

export const REFERENCING_STYLES = [
  { value: "APA_7TH", label: "APA 7th" },
  { value: "APA_6TH", label: "APA 6th" },
  { value: "HARVARD", label: "Harvard" },
  { value: "IEEE", label: "IEEE" },
  { value: "CHICAGO", label: "Chicago" },
  { value: "MLA", label: "MLA" },
  { value: "CUSTOM", label: "Custom / other" },
] as const;

export const PROJECT_TYPES = [
  { value: "THEORETICAL", label: "Theoretical" },
  { value: "PRACTICAL", label: "Practical" },
  { value: "DESIGN_BASED", label: "Design-based" },
  { value: "SURVEY_BASED", label: "Survey-based" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
] as const;

/** Quick-add suggestions for a worker's specialties (department areas). */
export const COMMON_SPECIALTIES = [
  "Mechanical Engineering",
  "Electrical Engineering",
  "Civil Engineering",
  "Computer Science",
  "Accounting",
  "Economics",
  "Business Administration",
  "Mass Communication",
  "Political Science",
  "Microbiology",
  "Biochemistry",
  "Public Health",
  "Education",
  "Law",
] as const;

/** Quick-add suggestions for a worker's technical skills. */
export const COMMON_SKILLS = [
  "SPSS",
  "MATLAB",
  "AutoCAD",
  "SolidWorks",
  "Python",
  "R",
  "Stata",
  "Origin",
  "EViews",
  "ANSYS",
  "Arduino",
  "Data Analysis",
  "Statistical Modelling",
  "Questionnaire Design",
] as const;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match nested routes (e.g. /admin/projects/123) instead of exact match. */
  matchNested?: boolean;
  /** Also light up anywhere under this path (e.g. the client's /client/projects/… pages for "/client"). */
  alsoActiveUnder?: string;
  /** Admin tabs only: the `UserRole`s that see this entry (absent = everyone in that nav). */
  roles?: readonly string[];
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

// The admin sidebar lives in `sidebar-config.ts`: every tab there names the
// roles that see it, and `navForRole` filters it for the signed-in executive.

export const WORKER_NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/worker", icon: LayoutDashboard },
      { label: "My Projects", href: "/worker/projects", icon: FolderKanban, matchNested: true },
      { label: "Earnings", href: "/worker/earnings", icon: Wallet },
      { label: "Profile", href: "/worker/profile", icon: User },
    ],
  },
];

export const AMBASSADOR_NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/ambassador", icon: LayoutDashboard },
      { label: "My link", href: "/ambassador/link", icon: MousePointerClick },
      { label: "Referrals", href: "/ambassador/referrals", icon: Users },
      { label: "Commissions", href: "/ambassador/commissions", icon: Wallet },
      { label: "Leaderboard", href: "/ambassador/leaderboard", icon: Trophy },
      { label: "Profile", href: "/ambassador/profile", icon: User },
    ],
  },
];

/**
 * Mobile bottom nav — max 5 items per the spec. 85% of users are on phones,
 * so these are the only routes reachable without opening the "More" sheet.
 * (The admin one is per executive role, in `sidebar-config.ts`.)
 */
export const WORKER_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/worker", icon: LayoutDashboard },
  { label: "Projects", href: "/worker/projects", icon: FolderKanban, matchNested: true },
  { label: "Earnings", href: "/worker/earnings", icon: Wallet },
  { label: "Profile", href: "/worker/profile", icon: User },
];

export const AMBASSADOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/ambassador", icon: LayoutDashboard },
  { label: "My link", href: "/ambassador/link", icon: MousePointerClick },
  { label: "Commissions", href: "/ambassador/commissions", icon: Wallet },
  { label: "Leaderboard", href: "/ambassador/leaderboard", icon: Trophy },
  { label: "Profile", href: "/ambassador/profile", icon: User },
];

/** Clients: their projects (each with its own tabs) and their profile. */
export const CLIENT_NAV: NavSection[] = [
  {
    items: [
      { label: "My projects", href: "/client", icon: FolderKanban, alsoActiveUnder: "/client/projects" },
      { label: "Profile", href: "/client/profile", icon: User },
    ],
  },
];

export const CLIENT_MOBILE_NAV: NavItem[] = [
  { label: "Projects", href: "/client", icon: FolderKanban, alsoActiveUnder: "/client/projects" },
  { label: "Profile", href: "/client/profile", icon: User },
];

export type NavRole = "admin" | "worker" | "ambassador" | "client";

/**
 * The navigation for a dashboard. For the admin area `userRole` (the login's
 * `User.role`) decides which tabs exist at all — an executive only ever gets
 * their own domain's, and an unknown role gets none.
 */
export function navForRole(role: NavRole, userRole?: string | null) {
  switch (role) {
    case "worker":
      return { sections: WORKER_NAV, mobile: WORKER_MOBILE_NAV, home: "/worker" };
    case "ambassador":
      return { sections: AMBASSADOR_NAV, mobile: AMBASSADOR_MOBILE_NAV, home: "/ambassador" };
    case "client":
      return { sections: CLIENT_NAV, mobile: CLIENT_MOBILE_NAV, home: "/client" };
    default:
      return {
        sections: adminNavForRole(userRole),
        mobile: adminMobileNavForRole(userRole),
        home: adminHomeForRole(userRole),
      };
  }
}
