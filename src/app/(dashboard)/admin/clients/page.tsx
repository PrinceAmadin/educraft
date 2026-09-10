import type { Metadata } from "next";
import { LuUsers, LuSearchX } from "react-icons/lu";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClientsTable } from "@/components/clients/ClientsTable";
import { CLIENT_PAGE_SIZE, listClients } from "@/lib/services/clients";
import { clientListParamsSchema } from "@/lib/validations/clients";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parsed = clientListParamsSchema.parse(flat);

  const { rows, total, page, pageCount } = await listClients({
    q: parsed.q,
    page: parsed.page,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has ordered from EduCraft. Search, then open a client for their history.
        </p>
      </div>

      <SearchInput placeholder="Search by name, phone, or university" className="block max-w-md" />

      {rows.length === 0 ? (
        parsed.q ? (
          <EmptyState
            icon={LuSearchX}
            title="No clients match that search"
            description="Try a name, phone number, or university abbreviation."
          />
        ) : (
          <EmptyState
            icon={LuUsers}
            title="No clients yet"
            description="Clients are created when you add a project for them, or when they submit the intake form."
          />
        )
      ) : (
        <div className="space-y-4">
          <ClientsTable rows={rows} />
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={CLIENT_PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}
