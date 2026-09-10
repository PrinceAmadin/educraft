import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  UserCog,
  Megaphone,
  ClipboardCheck,
  Wallet,
  BarChart3,
  Settings,
  Link2,
  Trophy,
  User,
  MoreHorizontal,
} from "lucide-react";

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
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { label: "Command Center", href: "/admin", icon: LayoutDashboard },
      { label: "Projects", href: "/admin/projects", icon: FolderKanban, matchNested: true },
      { label: "QA Review", href: "/admin/qa", icon: ClipboardCheck, matchNested: true },
    ],
  },
  {
    heading: "People",
    items: [
      { label: "Clients", href: "/admin/clients", icon: Users, matchNested: true },
      { label: "Workers", href: "/admin/workers", icon: UserCog, matchNested: true },
      { label: "Ambassadors", href: "/admin/ambassadors", icon: Megaphone, matchNested: true },
    ],
  },
  {
    heading: "Business",
    items: [
      { label: "Finance", href: "/admin/finance", icon: Wallet, matchNested: true },
      { label: "Reports", href: "/admin/reports", icon: BarChart3 },
      { label: "Settings", href: "/admin/settings", icon: Settings, matchNested: true },
    ],
  },
];

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
      { label: "Referrals", href: "/ambassador/referrals", icon: Link2 },
      { label: "Commissions", href: "/ambassador/commissions", icon: Wallet },
      { label: "Leaderboard", href: "/ambassador/leaderboard", icon: Trophy },
      { label: "Profile", href: "/ambassador/profile", icon: User },
    ],
  },
];

/**
 * Mobile bottom nav — max 5 items per the spec. 85% of users are on phones,
 * so these are the only routes reachable without opening the "More" sheet.
 */
export const ADMIN_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/admin", icon: LayoutDashboard },
  { label: "Projects", href: "/admin/projects", icon: FolderKanban, matchNested: true },
  { label: "QA", href: "/admin/qa", icon: ClipboardCheck, matchNested: true },
  { label: "Finance", href: "/admin/finance", icon: Wallet, matchNested: true },
  { label: "More", href: "#more", icon: MoreHorizontal },
];

export const WORKER_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/worker", icon: LayoutDashboard },
  { label: "Projects", href: "/worker/projects", icon: FolderKanban, matchNested: true },
  { label: "Earnings", href: "/worker/earnings", icon: Wallet },
  { label: "Profile", href: "/worker/profile", icon: User },
];

export const AMBASSADOR_MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/ambassador", icon: LayoutDashboard },
  { label: "Referrals", href: "/ambassador/referrals", icon: Link2 },
  { label: "Commissions", href: "/ambassador/commissions", icon: Wallet },
  { label: "Profile", href: "/ambassador/profile", icon: User },
];

export type NavRole = "admin" | "worker" | "ambassador";

export function navForRole(role: NavRole) {
  switch (role) {
    case "worker":
      return { sections: WORKER_NAV, mobile: WORKER_MOBILE_NAV, home: "/worker" };
    case "ambassador":
      return { sections: AMBASSADOR_NAV, mobile: AMBASSADOR_MOBILE_NAV, home: "/ambassador" };
    default:
      return { sections: ADMIN_NAV, mobile: ADMIN_MOBILE_NAV, home: "/admin" };
  }
}
