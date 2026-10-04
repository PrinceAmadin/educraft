"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBody, type NotificationView } from "@/components/notifications/NotificationItem";

/**
 * The full notifications feed (one page of it). Rows sit on the page with faint
 * dividers — no outer card. Clicking a row marks it read and follows its link;
 * "Mark all read" clears every unread notification, on this page and beyond.
 */
export function NotificationsList({ initial }: { initial: NotificationView[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<NotificationView[]>(initial);

  React.useEffect(() => {
    setItems(initial);
  }, [initial]);

  const hasUnread = items.some((n) => !n.read);

  async function markRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      /* will resync on next load */
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      /* will resync on next load */
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll}>
            Mark all read
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id}>
            {n.link ? (
              <Link
                href={n.link}
                onClick={() => {
                  if (!n.read) void markRead(n.id);
                }}
                className="block px-1 py-3.5 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
              >
                <NotificationBody n={n} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => !n.read && markRead(n.id)}
                className="block w-full px-1 py-3.5 text-left transition-colors hover:bg-elevated"
              >
                <NotificationBody n={n} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
