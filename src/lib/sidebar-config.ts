/**
 * The admin sidebar, one typed config: every tab names the roles that see it,
 * straight from the tab matrix in DATA/EDUCRAFT_RBAC/EDUCRAFT_Phase1_RBAC_Build.md.
 * `adminNavForRole` filters it for the signed-in executive and drops any
 * section left empty, so a tab another executive owns is never in the DOM.
 *
 * The route table in `rbac.ts` is what actually blocks a page; this only
 * decides what is offered. `scripts/check-rbac.ts` proves the two agree.
 */
import {
  Activity,
  BookCheck,
  ClipboardCheck,
  CreditCard,
  FolderKanban,
  Inbox,
  Landmark,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MoreHorizontal,
  Package,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { NavItem, NavSection } from "@/lib/constants";
import { effectiveRole, EXEC_ROLES, homeForRole, isExecRole, type ExecRole } from "@/lib/rbac";

const SA = "SUPER_ADMIN";
const CFO = "CO_CEO_CFO";
const HOG = "HOG";
const COO = "COO";
const ALL: readonly ExecRole[] = EXEC_ROLES;

export const ADMIN_SIDEBAR: NavSection[] = [
  {
    heading: "Overview",
    items: [{ label: "Command Center", href: "/admin", icon: LayoutDashboard, roles: [SA] }],
  },
  {
    heading: "Production",
    items: [
      { label: "Projects", href: "/admin/projects", icon: FolderKanban, matchNested: true, roles: [SA, COO] },
      { label: "QA Review", href: "/admin/qa", icon: ClipboardCheck, matchNested: true, roles: [SA, COO] },
      { label: "Research approvals", href: "/admin/research-requests", icon: BookCheck, roles: [SA, COO] },
      { label: "Client inbox", href: "/admin/client-inbox", icon: Inbox, roles: [SA, COO] },
      { label: "Clients", href: "/admin/clients", icon: Users, matchNested: true, roles: [SA, CFO, COO] },
      { label: "Workers", href: "/admin/workers", icon: UserCog, matchNested: true, roles: [SA, COO] },
    ],
  },
  {
    heading: "Growth",
    items: [
      { label: "Ambassadors", href: "/admin/ambassadors", icon: Megaphone, matchNested: true, roles: [SA, HOG] },
      { label: "Growth", href: "/admin/growth", icon: TrendingUp, matchNested: true, roles: [SA, HOG] },
    ],
  },
  {
    heading: "Finance",
    items: [
      // The Finance Platform: dashboard, revenue, payouts, buckets, founder draws, expenses, AI usage and
      // reports are tabs inside it. The COO has no Finance entry, only the payout engine.
      { label: "Finance", href: "/admin/finance", icon: Wallet, matchNested: true, roles: [SA, CFO] },
      { label: "Payouts", href: "/admin/finance/payouts", icon: CreditCard, roles: [SA, COO] },
    ],
  },
  {
    heading: "Reports",
    items: [
      { label: "Growth reports", href: "/admin/reports/growth", icon: LineChart, roles: [SA, HOG] },
      { label: "Operations reports", href: "/admin/reports/operations", icon: Activity, roles: [SA, COO] },
    ],
  },
  {
    heading: "Settings",
    items: [
      // Company details, pricing and alert emails: the founder's alone.
      { label: "General", href: "/admin/settings", icon: Settings, roles: [SA] },
      { label: "Team & roles", href: "/admin/settings/team", icon: ShieldCheck, roles: [SA] },
      { label: "Services", href: "/admin/settings/services", icon: Package, roles: [SA] },
      { label: "Bank details", href: "/admin/settings/bank", icon: Landmark, roles: ALL },
    ],
  },
];

const MORE: NavItem = { label: "More", href: "#more", icon: MoreHorizontal };

/**
 * The five bottom-nav slots per role (85% of users are on phones). The last
 * slot is always "More": it holds every remaining tab plus install,
 * notifications and sign out.
 */
const ADMIN_MOBILE: Record<ExecRole, NavItem[]> = {
  SUPER_ADMIN: [
    { label: "Home", href: "/admin", icon: LayoutDashboard },
    { label: "Projects", href: "/admin/projects", icon: FolderKanban, matchNested: true },
    { label: "QA", href: "/admin/qa", icon: ClipboardCheck, matchNested: true },
    { label: "Finance", href: "/admin/finance", icon: Wallet, matchNested: true },
    MORE,
  ],
  CO_CEO_CFO: [
    { label: "Finance", href: "/admin/finance", icon: Wallet },
    { label: "Revenue", href: "/admin/finance/revenue", icon: Activity },
    { label: "Payouts", href: "/admin/finance/payouts", icon: CreditCard },
    { label: "Clients", href: "/admin/clients", icon: Users, matchNested: true },
    MORE,
  ],
  HOG: [
    { label: "Ambassadors", href: "/admin/ambassadors", icon: Megaphone, matchNested: true },
    { label: "Growth", href: "/admin/growth", icon: TrendingUp, matchNested: true },
    { label: "Reports", href: "/admin/reports/growth", icon: LineChart },
    MORE,
  ],
  COO: [
    { label: "Projects", href: "/admin/projects", icon: FolderKanban, matchNested: true },
    { label: "QA", href: "/admin/qa", icon: ClipboardCheck, matchNested: true },
    { label: "Clients", href: "/admin/clients", icon: Users, matchNested: true },
    { label: "Workers", href: "/admin/workers", icon: UserCog, matchNested: true },
    MORE,
  ],
};

function canSee(item: NavItem, role: ExecRole): boolean {
  return !item.roles || item.roles.includes(role);
}

/** The sections this login sees, empty sections removed. Not an executive → nothing. */
export function adminNavForRole(userRole: string | undefined | null): NavSection[] {
  const role = effectiveRole(userRole);
  if (!isExecRole(role)) return [];
  return ADMIN_SIDEBAR.map((section) => ({ ...section, items: section.items.filter((item) => canSee(item, role)) })).filter(
    (section) => section.items.length > 0
  );
}

/** The bottom nav for this login; every slot is checked against the same matrix (a page under a nested entry counts). */
export function adminMobileNavForRole(userRole: string | undefined | null): NavItem[] {
  const role = effectiveRole(userRole);
  if (!isExecRole(role)) return [];
  const items = adminNavForRole(role).flatMap((s) => s.items);
  const visible = new Set(items.map((i) => i.href));
  const roots = items.filter((i) => i.matchNested).map((i) => i.href);
  return ADMIN_MOBILE[role].filter((item) => item.href === MORE.href || visible.has(item.href) || roots.some((r) => item.href.startsWith(`${r}/`)));
}

/** Where the admin sidebar's logo goes: the executive's own home. */
export function adminHomeForRole(userRole: string | undefined | null): string {
  const role = effectiveRole(userRole);
  return isExecRole(role) ? homeForRole(role) : "/admin";
}
