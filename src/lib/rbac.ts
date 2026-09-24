/**
 * Role-based access for HQ: which /admin pages and /api/admin routes each
 * member of staff may reach. Pure — no Prisma, no Node APIs — because the edge
 * middleware imports it. `roles.ts` says who is staff at all; this file says
 * what each of them can open.
 *
 * The tab matrix in DATA/EDUCRAFT_RBAC/EDUCRAFT_Phase1_RBAC_Build.md (Part 2)
 * is the source of truth for the route table below. Two rules on top of it:
 *   - SUPER_ADMIN passes every check.
 *   - Anything under /admin that no row names is SUPER_ADMIN only (fail closed).
 */

export const EXEC_ROLES = ["SUPER_ADMIN", "CO_CEO_CFO", "HOG", "COO"] as const;
export type ExecRole = (typeof EXEC_ROLES)[number];

/** Roles Team & Roles can hand out. A second SUPER_ADMIN needs the database. */
export const INVITABLE_ROLES = ["CO_CEO_CFO", "HOG", "COO"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isExecRole(role: string | undefined | null): role is ExecRole {
  return EXEC_ROLES.includes(role as ExecRole);
}

/**
 * The role a login is judged by. OPS_MANAGER predates the executive roles: no
 * login holds it and nothing offers it any more, so rather than keep a fifth
 * set of rules alive it is treated as COO (the operations domain).
 */
export function effectiveRole(role: string | undefined | null): string {
  if (role === "OPS_MANAGER") return "COO";
  return role ?? "";
}

/** Where each role lands after sign-in, and where a blocked request is sent. */
export const ROLE_HOME: Record<ExecRole, string> = {
  SUPER_ADMIN: "/admin",
  CO_CEO_CFO: "/admin/finance",
  HOG: "/admin/ambassadors",
  COO: "/admin/projects",
};

/** Landing route for every role, staff and person roles alike. */
export function homeForRole(role: string | undefined | null): string {
  const staff = effectiveRole(role);
  if (isExecRole(staff)) return ROLE_HOME[staff];
  switch (role) {
    case "WORKER":
      return "/worker";
    case "AMBASSADOR":
      return "/ambassador";
    case "CLIENT":
      return "/client";
    default:
      return "/";
  }
}

const ALL_EXECS = EXEC_ROLES;

export interface RoutePermission {
  /** Whole-segment prefix: "/admin/finance" covers /admin/finance and /admin/finance/…, never /admin/finances. */
  prefix: string;
  roles: readonly ExecRole[];
}

/**
 * Page routes. The most specific prefix wins, so /admin/finance/payouts is
 * judged by its own row before /admin/finance. The bare /admin row at the end
 * is what makes every unlisted admin page SUPER_ADMIN only.
 */
export const ROUTE_PERMISSIONS: readonly RoutePermission[] = [
  { prefix: "/admin/finance/payouts", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "COO"] },
  { prefix: "/admin/finance/ai-usage", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  { prefix: "/admin/finance", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  { prefix: "/admin/ambassadors", roles: ["SUPER_ADMIN", "HOG"] },
  { prefix: "/admin/growth", roles: ["SUPER_ADMIN", "HOG"] },
  { prefix: "/admin/projects", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/admin/qa", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/admin/research-requests", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/admin/workers", roles: ["SUPER_ADMIN", "COO"] },
  // Client messages and documents waiting for review are the delivery pipeline
  // (the COO's domain); the matrix predates this page.
  { prefix: "/admin/client-inbox", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/admin/clients", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "COO"] },
  { prefix: "/admin/reports/finance", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  { prefix: "/admin/reports/growth", roles: ["SUPER_ADMIN", "HOG"] },
  { prefix: "/admin/reports/operations", roles: ["SUPER_ADMIN", "COO"] },
  // The reports index only forwards each role to its own report.
  { prefix: "/admin/reports", roles: ALL_EXECS },
  { prefix: "/admin/settings/team", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/settings/services", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/settings/bank", roles: ALL_EXECS },
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
];

export interface ApiPermission extends RoutePermission {
  /** Roles that may only read (GET/HEAD): the clients tab is read-only for the CFO and COO. */
  readOnly?: readonly ExecRole[];
}

/**
 * /api/admin routes, judged the same way. Marking payouts paid is the CFO's,
 * never the COO's (who only sees the queue), and every client mutation is the
 * founder's.
 */
export const API_PERMISSIONS: readonly ApiPermission[] = [
  { prefix: "/api/admin/team", roles: ["SUPER_ADMIN"] },
  { prefix: "/api/admin/settings/bank", roles: ALL_EXECS },
  { prefix: "/api/admin/settings", roles: ["SUPER_ADMIN"] },
  // The COO's own corner of the payout engine: their worker list and its submission.
  { prefix: "/api/admin/finance/payouts/coo-view", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "COO"] },
  { prefix: "/api/admin/finance/payouts/coo-submit", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "COO"] },
  { prefix: "/api/admin/finance/payouts", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  // The HOG's sponsorship spending from the Growth Fund, and the budget it is measured against.
  { prefix: "/api/admin/finance/expenses/sponsorship", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "HOG"] },
  { prefix: "/api/admin/finance/expenses/hog-budget", roles: ["SUPER_ADMIN", "CO_CEO_CFO", "HOG"] },
  { prefix: "/api/admin/finance/settings", roles: ["SUPER_ADMIN"], readOnly: ["CO_CEO_CFO"] },
  { prefix: "/api/admin/finance", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  { prefix: "/api/admin/ai-usage", roles: ["SUPER_ADMIN", "CO_CEO_CFO"] },
  { prefix: "/api/admin/ambassadors", roles: ["SUPER_ADMIN", "HOG"] },
  { prefix: "/api/admin/roster", roles: ["SUPER_ADMIN", "HOG"] },
  { prefix: "/api/admin/projects", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/api/admin/qa", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/api/admin/research-rerun-requests", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/api/admin/workers", roles: ["SUPER_ADMIN", "COO"] },
  { prefix: "/api/admin/probono", roles: ["SUPER_ADMIN"] },
  { prefix: "/api/admin/clients", roles: ["SUPER_ADMIN"], readOnly: ["CO_CEO_CFO", "COO"] },
];

/** Whole path segments only: "/admin/finance" must not catch "/admin/finances". */
export function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function longestMatch<T extends RoutePermission>(table: readonly T[], path: string): T | undefined {
  let best: T | undefined;
  for (const row of table) {
    if (underPrefix(path, row.prefix) && (!best || row.prefix.length > best.prefix.length)) best = row;
  }
  return best;
}

/** The row that decides `path`, for the sidebar and the checks. */
export function routePermissionFor(path: string): RoutePermission | undefined {
  return longestMatch(ROUTE_PERMISSIONS, path);
}

/**
 * May this role open this admin page? SUPER_ADMIN always; anyone else only if
 * the most specific matching row names them. No row → no (fail closed).
 */
export function canAccessRoute(role: string | undefined | null, path: string): boolean {
  const r = effectiveRole(role);
  if (r === "SUPER_ADMIN") return true;
  if (!isExecRole(r)) return false;
  const row = routePermissionFor(path);
  return row ? row.roles.includes(r) : false;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** May this role call this /api/admin route with this method? Same rules as pages. */
export function canCallAdminApi(role: string | undefined | null, path: string, method: string): boolean {
  const r = effectiveRole(role);
  if (r === "SUPER_ADMIN") return true;
  if (!isExecRole(r)) return false;
  const row = longestMatch(API_PERMISSIONS, path);
  if (!row) return false;
  if (row.roles.includes(r)) return true;
  return Boolean(row.readOnly?.includes(r) && READ_METHODS.has(method.toUpperCase()));
}

/** The Claude credit indicator in the topbar: only the people who pay for it see it. */
export function showsAiBalance(role: string | undefined | null): boolean {
  const r = effectiveRole(role);
  return r === "SUPER_ADMIN" || r === "CO_CEO_CFO";
}

/** Exec whose access to the Clients tab is read-only (no edits, no notes). */
export function clientsReadOnly(role: string | undefined | null): boolean {
  return effectiveRole(role) !== "SUPER_ADMIN";
}

/** Who may mark a payout as paid: the founder and the CFO. The COO only reviews the queue. */
export function canMarkPayoutsPaid(role: string | undefined | null): boolean {
  const r = effectiveRole(role);
  return r === "SUPER_ADMIN" || r === "CO_CEO_CFO";
}

/**
 * Who may confirm (verify) or reject a client payment: the founder and the
 * CFO — verifying is a finance act. The COO marks a bank transfer as paid and
 * finance confirms it from the Revenue Tracker.
 */
export function canVerifyPayments(role: string | undefined | null): boolean {
  const r = effectiveRole(role);
  return r === "SUPER_ADMIN" || r === "CO_CEO_CFO";
}

export type RoleTone = "teal" | "gold" | "green" | "purple";

/** The short chip beside the name in the topbar. */
export const ROLE_BADGE: Record<ExecRole, { label: string; tone: RoleTone }> = {
  SUPER_ADMIN: { label: "CEO", tone: "teal" },
  CO_CEO_CFO: { label: "CFO", tone: "gold" },
  HOG: { label: "HOG", tone: "green" },
  COO: { label: "COO", tone: "purple" },
};

/** Default title for each executive role (the ExecProfile can carry a longer one). */
export const ROLE_TITLES: Record<ExecRole, string> = {
  SUPER_ADMIN: "CEO & Chief Product Officer",
  CO_CEO_CFO: "Co-CEO & Chief Financial Officer",
  HOG: "Head of Growth",
  COO: "Chief Operating Officer",
};

/** Long-form role names, for lists and the account menu. */
export const EXEC_ROLE_LABELS: Record<ExecRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CO_CEO_CFO: "Co-CEO & CFO",
  HOG: "Head of Growth",
  COO: "Chief Operating Officer",
};
