import { requirePortalProfile } from "@/lib/portal-access-guard";

export default async function WorkerPortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalProfile("worker");
  return children;
}
