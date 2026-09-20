import { requirePortalProfile } from "@/lib/portal-access-guard";

export default async function AmbassadorPortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalProfile("ambassador");
  return children;
}
