import { redirect } from "next/navigation";
import { getClientScope } from "@/lib/api";

/**
 * Every client page sits behind this. The middleware already sends signed-out
 * visitors to sign in; this also catches an expired client session or a
 * non-client login before any page code runs. Pages still filter every query
 * by `scope.clientIds` themselves.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");
  return <>{children}</>;
}
