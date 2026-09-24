/**
 * Checks the access rules against the founder's tab matrix, with no database:
 * which tabs each executive sees, that the sidebar and the route table agree,
 * that every home is reachable and that unlisted routes fail closed.
 *
 *   npm run check:rbac
 *
 * Fails (exit 1) on any mismatch. Run it after touching src/lib/rbac.ts or
 * src/lib/sidebar-config.ts.
 */
import {
  API_PERMISSIONS,
  canAccessRoute,
  canCallAdminApi,
  EXEC_ROLES,
  homeForRole,
  ROUTE_PERMISSIONS,
  type ExecRole,
} from "../src/lib/rbac";
import { ADMIN_SIDEBAR, adminMobileNavForRole, adminNavForRole } from "../src/lib/sidebar-config";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const labelsFor = (role: string) => adminNavForRole(role).flatMap((s) => s.items.map((i) => i.label));

// ── The matrix, as the spec's checklist words it ─────────────────────────────

expect(
  "CO_CEO_CFO sees exactly her tabs",
  labelsFor("CO_CEO_CFO"),
  ["Clients", "Finance", "Payout queue", "AI usage", "Finance reports", "Bank details"]
);
expect("HOG sees exactly his tabs", labelsFor("HOG"), ["Ambassadors", "Growth", "Growth reports", "Bank details"]);
expect(
  "COO sees exactly his tabs",
  labelsFor("COO"),
  ["Projects", "QA Review", "Research approvals", "Client inbox", "Clients", "Workers", "Payout queue", "Operations reports", "Bank details"]
);
expect(
  "SUPER_ADMIN sees every tab",
  labelsFor("SUPER_ADMIN"),
  ADMIN_SIDEBAR.flatMap((s) => s.items.map((i) => i.label))
);
expect("OPS_MANAGER (retired) is judged as COO", labelsFor("OPS_MANAGER"), labelsFor("COO"));
expect("a worker login gets no admin tabs", labelsFor("WORKER"), []);
expect("an empty role gets no admin tabs", labelsFor(""), []);

// Empty sections vanish, not just their items
for (const role of EXEC_ROLES) {
  expect(`${role}: no empty sections`, adminNavForRole(role).every((s) => s.items.length > 0), true);
}
expect("HOG has no Production or Finance section", adminNavForRole("HOG").map((s) => s.heading), ["Growth", "Reports", "Settings"]);
expect("CFO has no Growth section", adminNavForRole("CO_CEO_CFO").map((s) => s.heading), ["Production", "Finance", "Reports", "Settings"]);

// ── Sidebar and route table agree ───────────────────────────────────────────

for (const section of ADMIN_SIDEBAR) {
  for (const item of section.items) {
    for (const role of EXEC_ROLES) {
      const offered = item.roles?.includes(role) ?? true;
      expect(`${role} ${offered ? "may open" : "is blocked from"} ${item.href} (sidebar ⇄ routes)`, canAccessRoute(role, item.href), offered);
    }
  }
}

// ── Homes and redirects ─────────────────────────────────────────────────────

expect("homes", Object.fromEntries(EXEC_ROLES.map((r) => [r, homeForRole(r)])), {
  SUPER_ADMIN: "/admin",
  CO_CEO_CFO: "/admin/finance",
  HOG: "/admin/ambassadors",
  COO: "/admin/projects",
});
for (const role of EXEC_ROLES) expect(`${role}: own home is allowed (no redirect loop)`, canAccessRoute(role, homeForRole(role)), true);
expect("OPS_MANAGER home", homeForRole("OPS_MANAGER"), "/admin/projects");
expect("WORKER home", homeForRole("WORKER"), "/worker");
expect("AMBASSADOR home", homeForRole("AMBASSADOR"), "/ambassador");
expect("CLIENT home", homeForRole("CLIENT"), "/client");
expect("unknown home", homeForRole(undefined), "/");

// ── The spec's own route tests ──────────────────────────────────────────────

expect("COO cannot open /admin/finance", canAccessRoute("COO", "/admin/finance"), false);
expect("HOG cannot open /admin/workers", canAccessRoute("HOG", "/admin/workers"), false);
expect("CFO cannot open /admin/projects", canAccessRoute("CO_CEO_CFO", "/admin/projects"), false);
expect("COO can open /admin/finance/payouts", canAccessRoute("COO", "/admin/finance/payouts"), true);
expect("HOG cannot open /admin/finance/payouts", canAccessRoute("HOG", "/admin/finance/payouts"), false);
expect("only SUPER_ADMIN opens the Command Center", EXEC_ROLES.map((r) => canAccessRoute(r, "/admin")), [true, false, false, false]);
expect("only SUPER_ADMIN opens Team & roles", EXEC_ROLES.map((r) => canAccessRoute(r, "/admin/settings/team")), [true, false, false, false]);
expect("everyone opens Bank details", EXEC_ROLES.map((r) => canAccessRoute(r, "/admin/settings/bank")), [true, true, true, true]);
expect("nested pages inherit (COO on a project)", canAccessRoute("COO", "/admin/projects/abc/assign"), true);
expect("nested pages inherit (CFO on expenses)", canAccessRoute("CO_CEO_CFO", "/admin/finance/expenses"), true);
expect("most specific prefix wins (COO on /admin/finance/payouts/x)", canAccessRoute("COO", "/admin/finance/payouts/x"), true);
expect("whole segments only (/admin/finances is not finance)", canAccessRoute("CO_CEO_CFO", "/admin/finances"), false);

// Fail closed: anything under /admin that no row names is the founder's alone
for (const path of ["/admin/settings", "/admin/something-new", "/admin/projects-archive"]) {
  expect(`${path} fails closed`, EXEC_ROLES.map((r) => canAccessRoute(r, path)), [true, false, false, false]);
}
expect("a person role never opens /admin", ["WORKER", "AMBASSADOR", "CLIENT", ""].map((r) => canAccessRoute(r, "/admin/projects")), [false, false, false, false]);

// The table has no duplicate prefixes and every prefix is whole-segment under /admin
expect("no duplicate route prefixes", new Set(ROUTE_PERMISSIONS.map((r) => r.prefix)).size, ROUTE_PERMISSIONS.length);
expect("every route prefix is under /admin", ROUTE_PERMISSIONS.every((r) => r.prefix === "/admin" || r.prefix.startsWith("/admin/")), true);
expect("no duplicate api prefixes", new Set(API_PERMISSIONS.map((r) => r.prefix)).size, API_PERMISSIONS.length);

// ── /api/admin ──────────────────────────────────────────────────────────────

expect("CFO may read clients", canCallAdminApi("CO_CEO_CFO", "/api/admin/clients", "GET"), true);
expect("CFO may not edit a client", canCallAdminApi("CO_CEO_CFO", "/api/admin/clients/x/email", "PATCH"), false);
expect("COO may read clients", canCallAdminApi("COO", "/api/admin/clients", "GET"), true);
expect("COO may not edit a client", canCallAdminApi("COO", "/api/admin/clients/x/notes", "PATCH"), false);
expect("SUPER_ADMIN edits clients", canCallAdminApi("SUPER_ADMIN", "/api/admin/clients/x/notes", "PATCH"), true);
expect("COO may not mark payouts paid", canCallAdminApi("COO", "/api/admin/finance/payouts", "POST"), false);
expect("CFO marks payouts paid", canCallAdminApi("CO_CEO_CFO", "/api/admin/finance/payouts", "POST"), true);
expect("HOG may not see the AI balance", canCallAdminApi("HOG", "/api/admin/ai-usage/balance", "GET"), false);
expect("CFO sees the AI balance", canCallAdminApi("CO_CEO_CFO", "/api/admin/ai-usage/balance", "GET"), true);
expect("HOG runs the roster", canCallAdminApi("HOG", "/api/admin/roster/001", "PATCH"), true);
expect("COO may not touch ambassadors", canCallAdminApi("COO", "/api/admin/ambassadors", "POST"), false);
expect("HOG may not touch projects", canCallAdminApi("HOG", "/api/admin/projects/x/transition", "POST"), false);
expect("only SUPER_ADMIN manages the team", EXEC_ROLES.map((r) => canCallAdminApi(r, "/api/admin/team", "POST")), [true, false, false, false]);
expect("everyone saves their own bank details", EXEC_ROLES.map((r) => canCallAdminApi(r, "/api/admin/settings/bank", "PATCH")), [true, true, true, true]);
expect("unlisted api fails closed", EXEC_ROLES.map((r) => canCallAdminApi(r, "/api/admin/new-thing", "GET")), [true, false, false, false]);
expect("a person role never calls /api/admin", canCallAdminApi("WORKER", "/api/admin/clients", "GET"), false);

// ── Mobile nav ──────────────────────────────────────────────────────────────

for (const role of EXEC_ROLES) {
  const mobile = adminMobileNavForRole(role);
  const visible = new Set(adminNavForRole(role).flatMap((s) => s.items.map((i) => i.href)));
  expect(`${role}: at most 5 bottom-nav slots`, mobile.length <= 5, true);
  expect(`${role}: bottom nav ends with More`, mobile[mobile.length - 1]?.href, "#more");
  expect(`${role}: every bottom-nav slot is a visible tab`, mobile.filter((i) => i.href !== "#more").every((i) => visible.has(i.href)), true);
  expect(`${role}: bottom nav starts at home`, mobile[0]?.href, homeForRole(role as ExecRole));
}
expect("SUPER_ADMIN bottom nav unchanged", adminMobileNavForRole("SUPER_ADMIN").map((i) => i.label), ["Home", "Projects", "QA", "Finance", "More"]);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("RBAC rules match the matrix.");
