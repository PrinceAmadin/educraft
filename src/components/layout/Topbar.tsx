"use client";

import Link from "next/link";
import { LogOut, Search, Settings, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { LogoLockup } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
  name: string;
  email: string;
  roleLabel: string;
}

export function Topbar({ role, name, email, roleLabel }: TopbarProps) {
  const { home } = navForRole(role);

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

        <ThemeToggle />

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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
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
