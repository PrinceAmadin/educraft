"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

interface Item {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const DOT: Record<string, string> = {
  urgent: "bg-danger",
  warning: "bg-gold",
  success: "bg-success",
  info: "bg-primary",
};

export function NotificationBell() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Item[]; unread: number };
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* offline — leave the last state */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      /* will resync on next poll */
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      /* resync on next poll */
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAll}>
              Mark all read
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up</p>
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border overflow-y-auto">
            {items.map((n) => {
              const body = (
                <div className="flex gap-2.5">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : DOT[n.type] ?? "bg-primary"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className={cn("text-sm", n.read ? "text-muted-foreground" : "text-foreground")}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => {
                        if (!n.read) void markRead(n.id);
                        setOpen(false);
                      }}
                      className="block px-3 py-2.5 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !n.read && markRead(n.id)}
                      className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-elevated"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
