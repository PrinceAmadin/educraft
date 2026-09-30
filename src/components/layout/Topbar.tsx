"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, BellOff, BellRing, Download, FlaskConical, LogOut, RefreshCw, Repeat2, Search, Settings, User } from "lucide-react";
import { usePwa } from "@/components/pwa/PwaProvider";
import { usePush } from "@/hooks/use-push";
import { signOutAndClear, switchAccountSilent } from "@/lib/pwa/sign-out";
import { LogoLockup } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AiBalanceIndicator } from "@/components/layout/AiBalanceIndicator";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { RoleChip } from "@/components/layout/RoleChip";
import { FlagByCodeDialog } from "@/components/cleanup/FlagByCodeDialog";
import { canAccessRoute, showsAiBalance } from "@/lib/rbac";
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

/** Another login of the same executive: switching signs out and opens sign-in with this email filled in. */
export interface SwitchAccount {
  email: string;
  /** "EduCraft HQ", "my worker & ambassador account". */
  label: string;
}

interface TopbarProps {
  role: NavRole;
  /** The login's `User.role`: which executive this is, if any. */
  userRole?: string;
  /** Set on an executive's other-email login (a worker/ambassador login): their chip still shows. */
  linkedExecRole?: string | null;
  switchAccounts?: SwitchAccount[];
  /** The COO, or someone the founder appointed, can flag a project as a test from here. */
  canFlagTestProjects?: boolean;
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

const PORTAL_LABELS: Record<string, string> = {
  admin: "HQ",
  worker: "Worker dashboard",
  ambassador: "Ambassador dashboard",
  client: "Client dashboard",
};

export function Topbar({ role, userRole, linkedExecRole = null, switchAccounts = [], canFlagTestProjects = false, portals = [], name, email, roleLabel }: TopbarProps) {
  const { home } = navForRole(role, userRole);
  // The chip names the executive: their own login's role, or the one this login belongs to.
  const chipRole = linkedExecRole ?? userRole;
  const otherPortals = portals.filter((p) => p !== role && PORTAL_LABELS[p]);
  const { canInstall, promptInstall } = usePwa();
  const push = usePush();
  // Which switch item is mid-swap — the menu item goes disabled + says "Switching…" so a
  // double-click can't fire two swaps.
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const [flagOpen, setFlagOpen] = React.useState(false);
  // The project search lands on /admin/projects, so only roles who own that page get it.
  const canSearchProjects = role === "admin" && canAccessRoute(userRole, "/admin/projects");

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 bg-background/80 px-4 backdrop-blur-md md:px-6">
      {/* Mobile brand — the sidebar is hidden below md, so the logo lives here */}
      <div className="md:hidden">
        <LogoLockup href={home} size="xs" />
      </div>

      {/* Desktop search: founder and COO. Searches projects by ID, title or client name. */}
      {canSearchProjects ? (
        <form action="/admin/projects" method="get" role="search" className="hidden flex-1 md:block">
          <label className="relative block max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              name="q"
              placeholder="Search projects by ID, title or client…"
              className="h-10 w-full rounded-lg border border-transparent bg-card pl-9 pr-3 text-sm text-foreground shadow-soft placeholder:text-subtle transition-[border-color,box-shadow] duration-fast focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
            <span className="sr-only">Search projects</span>
          </label>
        </form>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {canSearchProjects ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden text-muted-foreground"
            aria-label="Search projects"
            asChild
          >
            <Link href="/admin/projects">
              <Search className="h-[18px] w-[18px]" />
            </Link>
          </Button>
        ) : null}

        <RefreshButton />

        <ThemeToggle />

        {/* Claude credit: only the founder and the CFO, who pay for it */}
        {role === "admin" && showsAiBalance(userRole) ? <AiBalanceIndicator /> : null}

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Account menu"
            >
              {/* Who is signed in, and as what: the executive's name from lg up, the role chip from sm up */}
              {role === "admin" ? (
                <span className="hidden max-w-[180px] truncate text-sm font-medium text-foreground lg:inline">{name}</span>
              ) : null}
              <RoleChip role={chipRole} className="hidden sm:inline-flex" />
              <Avatar>
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                  <RoleChip role={chipRole} />
                </span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
                <Badge variant="neutral" className="mt-1 w-fit">
                  {roleLabel}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {role === "admin" ? (
              <DropdownMenuItem asChild>
                {/* General settings are the founder's; an executive's own settings page is Bank details */}
                <Link href={canAccessRoute(userRole, "/admin/settings") ? "/admin/settings" : "/admin/settings/bank"}>
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
                <Link href={navForRole(p, userRole).home}>
                  <Repeat2 />
                  Switch to {p === "admin" ? "EduCraft HQ" : PORTAL_LABELS[p].toLowerCase()}
                </Link>
              </DropdownMenuItem>
            ))}
            {switchAccounts.map((a) => (
              <DropdownMenuItem
                key={a.email}
                disabled={switchingTo !== null}
                onSelect={(e) => {
                  e.preventDefault();
                  if (switchingTo) return;
                  setSwitchingTo(a.email);
                  void switchAccountSilent({ email: a.email, label: a.label });
                }}
              >
                <ArrowLeftRight />
                <span className="flex min-w-0 flex-col">
                  <span>{switchingTo === a.email ? "Switching…" : `Switch to ${a.label}`}</span>
                </span>
              </DropdownMenuItem>
            ))}
            {canFlagTestProjects ? (
              // Opened once the menu has closed, so the menu's focus return can't fight the dialog's.
              <DropdownMenuItem onSelect={() => window.setTimeout(() => setFlagOpen(true), 0)}>
                <FlaskConical />
                Flag a test project
              </DropdownMenuItem>
            ) : null}
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
        {canFlagTestProjects ? <FlagByCodeDialog open={flagOpen} onOpenChange={setFlagOpen} /> : null}
      </div>
    </header>
  );
}
