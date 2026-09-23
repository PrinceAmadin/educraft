import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LuArrowLeft } from "react-icons/lu";
import { getClientScope } from "@/lib/api";
import { findClientProject, getClientProjectView, reconcileClientPayments } from "@/lib/services/client-portal";
import { parseClientTab } from "@/components/client/ClientProjectTabs";
import { ClientProjectScreen } from "@/components/client/ClientProjectScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { projectId: string } }): Promise<Metadata> {
  return { title: decodeURIComponent(params.projectId).toUpperCase() };
}

export default async function ClientProjectPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { tab?: string; payment?: string; reference?: string; trxref?: string };
}) {
  const scope = await getClientScope();
  if (!scope) redirect("/client/login");

  const found = await findClientProject(scope, params.projectId);
  if (!found) notFound();

  // Back from Paystack: ask Paystack now rather than wait for its webhook.
  const reference = searchParams.reference ?? searchParams.trxref ?? null;
  const returnedFromPaystack = searchParams.payment === "success" || Boolean(reference);
  if (returnedFromPaystack) await reconcileClientPayments(found.id, reference);

  const view = await getClientProjectView(scope, params.projectId);
  if (!view) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link
        href="/client"
        className="-ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        My projects
      </Link>
      <ClientProjectScreen
        view={view}
        tab={parseClientTab(searchParams.tab)}
        basePath={`/client/projects/${encodeURIComponent(view.code)}`}
        returnedFromPaystack={returnedFromPaystack}
      />
    </div>
  );
}
