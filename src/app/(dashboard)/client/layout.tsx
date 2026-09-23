import { redirect } from "next/navigation";
import { getClientScope } from "@/lib/api";
import { auth, homeForRole } from "@/lib/auth";

/**
 * Every client page sits behind this. The middleware already sends signed-out
 * visitors to sign in; this also catches an expired client session, and a
 * worker or ambassador login that has no client orders (they go back to their
 * own dashboard). Pages still filter every query by `scope.clientIds` themselves.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const scope = await getClientScope();
  if (!scope) {
    const session = await auth();
    const home = session?.user && session.user.role !== "CLIENT" ? homeForRole(session.user.role) : "/client/login";
    redirect(home === "/client" ? "/client/login" : home);
  }
  return <>{children}</>;
}
