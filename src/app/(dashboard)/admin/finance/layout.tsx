import { auth } from "@/lib/auth";
import { canAccessRoute } from "@/lib/rbac";
import { FinanceTabs, type FinanceTab } from "@/components/finance/FinanceTabs";

/** Every Finance Platform page, in the spec's order. A role only gets the tabs it may open. */
const FINANCE_TABS: FinanceTab[] = [
  { href: "/admin/finance", label: "Dashboard" },
  { href: "/admin/finance/revenue", label: "Revenue" },
  { href: "/admin/finance/payouts", label: "Payouts" },
  { href: "/admin/finance/buckets", label: "Buckets" },
  { href: "/admin/finance/founder-draws", label: "Founder draws", short: "Draws" },
  { href: "/admin/finance/expenses", label: "Expenses" },
  { href: "/admin/finance/ai-usage", label: "AI usage" },
  { href: "/admin/finance/reports", label: "Reports" },
];

/**
 * The Finance Platform shell: the sub-navigation above every finance page.
 * The COO, who may open only Payouts, gets no tab bar at all — one tab is
 * no navigation.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  const tabs = FINANCE_TABS.filter((t) => canAccessRoute(role, t.href));
  return (
    <div className="space-y-6">
      <FinanceTabs tabs={tabs} />
      {children}
    </div>
  );
}
