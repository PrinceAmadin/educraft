import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute, homeForRole } from "@/lib/rbac";
import { isStaffRole } from "@/lib/roles";
import { PATHNAME_HEADER } from "@/lib/request-path";

/**
 * Second line of defence for /admin pages. The middleware already sends a
 * staff login that strays outside its domain back home; this re-runs the same
 * table on the server, from the pathname the middleware stamped on the
 * request, so a gap in the matcher can never expose another executive's tab.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isStaffRole(session.user.role)) redirect(homeForRole(session.user.role));

  const path = headers().get(PATHNAME_HEADER);
  if (path && !canAccessRoute(session.user.role, path)) redirect(homeForRole(session.user.role));

  return children;
}
