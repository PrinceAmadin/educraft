import { redirect } from "next/navigation";
import { LuBell } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { listUserNotificationsPaged } from "@/lib/services/notifications";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { page?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const requested = Number(rawPage);
  const page = Number.isFinite(requested) && requested > 1 ? Math.floor(requested) : 1;

  const { rows, total, page: current, pageCount } = await listUserNotificationsPaged(
    session.user.id,
    page,
    PAGE_SIZE
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        description="Everything EduCraft has flagged for you, newest first."
      />

      {total === 0 ? (
        <EmptyState
          icon={LuBell}
          title="You're all caught up"
          description="New notifications about your projects, payments and approvals will appear here."
        />
      ) : (
        <div className="space-y-5">
          <NotificationsList initial={rows} />
          <Pagination
            page={current}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            noun="notification"
          />
        </div>
      )}
    </div>
  );
}
