"use client";

import * as React from "react";
import Link from "next/link";
import { BellOff, BellRing, Download, LogOut, RefreshCw, Repeat2, Search, Settings, User } from "lucide-react";
import { usePwa } from "@/components/pwa/PwaProvider";
import { usePush } from "@/hooks/use-push";
import { signOutAndClear } from "@/lib/pwa/sign-out";
import { LogoLockup } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AiBalanceIndicator } from "@/components/layout/AiBalanceIndicator";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navForRole, type NavRole } from "@/lib/constants";
import { initials } from "@/lib/utils";

interface TopbarProps {
  role: NavRole;
  /** Dashboards this login can open; a switcher shows when there is more than one. */
  portals?: NavRole[];
  name: string;
  email: string;
  roleLabel: string;
}

/**
 * A full reload rather than router.refresh(): the point is picking up a new
 * deploy (new JS bundles, not just fresh server data), which a soft
 * client-side refresh can't do.
 */
function RefreshButton() {
  const [spinning, setSpinning] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label="Refresh"
      title="Refresh"
      onClick={() => {
        setSpinning(true);
        window.location.reload();
      }}
    >
      <RefreshCw className={`h-[18px] w-[18px] ${spinning ? "animate-spin" : ""}`} />
    </Button>
  );
}

const PORTAL_LABELS: Record<string, string> = { worker: "Worker dashboard", ambassador: "Ambassador dashboard" };

export function Topbar({ role, portals = [], name, email, roleLabel }: TopbarProps) {
  const { home } = navForRole(role);
  const otherPortals = portals.filter((p) => p !== role && PORTAL_LABELS[p]);
  const { canInstall, promptInstall } = usePwa();
  const push = usePush();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 bg-background/80 px-4 backdrop-blur-md md:px-6">
      {/* Mobile brand — the sidebar is hidden below md, so the logo lives here */}
      <div className="md:hidden">
        <LogoLockup href={home} size="xs" />
      </div>

      {/* Desktop search */}
      <div className="hidden flex-1 md:block">
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            placeholder="Search projects, clients, workers…"
            className="h-10 w-full rounded-lg border border-transparent bg-card pl-9 pr-3 text-sm text-foreground shadow-soft placeholder:text-subtle transition-[border-color,box-shadow] duration-fast focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
          />
          <span className="sr-only">Search</span>
        </label>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden text-muted-foreground"
          aria-label="Search"
          asChild
        >
          <Link href="#search">
            <Search className="h-[18px] w-[18px]" />
          </Link>
        </Button>

        <RefreshButton />

        <ThemeToggle />

        {role === "admin" ? <AiBalanceIndicator /> : null}

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Account menu"
            >
              <Avatar>
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
                <Badge variant="neutral" className="mt-1 w-fit">
                  {roleLabel}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {role === "admin" ? (
              <DropdownMenuItem asChild>
                <Link href="/admin/settings">
                  <Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href={`${home}/profile`}>
                  <User />
                  Profile
                </Link>
              </DropdownMenuItem>
            )}
            {otherPortals.map((p) => (
              <DropdownMenuItem key={p} asChild>
                <Link href={navForRole(p).home}>
                  <Repeat2 />
                  Switch to {PORTAL_LABELS[p].toLowerCase()}
                </Link>
              </DropdownMenuItem>
            ))}
            {canInstall ? (
              <DropdownMenuItem onClick={() => void promptInstall()}>
                <Download />
                Install app
              </DropdownMenuItem>
            ) : null}
            {push.state === "off" || push.state === "on" ? (
              <DropdownMenuItem
                disabled={push.busy}
                onSelect={(e) => {
                  e.preventDefault();
                  void (push.state === "on" ? push.disable() : push.enable());
                }}
              >
                {push.state === "on" ? <BellOff /> : <BellRing />}
                {push.state === "on" ? "Turn off notifications" : "Turn on notifications"}
              </DropdownMenuItem>
            ) : null}
            {push.state === "blocked" ? (
              <DropdownMenuItem disabled>
                <BellOff />
                Notifications blocked in browser
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOutAndClear()}
              className="text-danger focus:text-danger"
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
