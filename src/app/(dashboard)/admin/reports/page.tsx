import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute, homeForRole } from "@/lib/rbac";

/**
 * Reports is three tabs, one per domain. This index only forwards each role
 * to the first report it may open (the founder lands on finance, as the old
 * single report did), keeping any `?month=` along.
 */
export default async function ReportsIndexPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const query = searchParams.month ? `?month=${encodeURIComponent(searchParams.month)}` : "";
  for (const domain of ["finance", "operations", "growth"]) {
    if (canAccessRoute(session.user.role, `/admin/reports/${domain}`)) redirect(`/admin/reports/${domain}${query}`);
  }
  redirect(homeForRole(session.user.role));
}
