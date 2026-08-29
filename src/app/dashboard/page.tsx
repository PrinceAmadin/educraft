import { redirect } from "next/navigation";
import { auth, homeForRole } from "@/lib/auth";

/**
 * Post-login hand-off. `signIn` can't know the user's role, so it lands here
 * and this server component forwards each role to its own portal.
 */
export default async function DashboardRedirectPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(homeForRole(session.user.role));
}
