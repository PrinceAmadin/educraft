"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoLockup } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navForRole, type NavRole, type NavItem } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "educraft:sidebar-collapsed";

export function isActive(pathname: string, item: NavItem) {
  // AI usage lives under /admin/finance but has its own nav entry — don't light up both.
  if (item.href === "/admin/finance" && pathname.startsWith("/admin/finance/ai-usage")) return false;
  if (item.alsoActiveUnder && (pathname === item.alsoActiveUnder || pathname.startsWith(`${item.alsoActiveUnder}/`))) {
    return true;
  }
  if (item.matchNested) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export function Sidebar({ role }: { role: NavRole }) {
  const pathname = usePathname();
  const { sections, home } = navForRole(role);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode / blocked storage — keep the expanded default */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        data-collapsed={collapsed}
        className={cn(
          // Hidden on mobile — MobileNav takes over below md
          "hidden md:flex md:flex-col",
          // In-flow flex child so the content area reflows when it collapses
          // No dividing line — the sidebar is one surface step off the page
          "sticky top-0 z-40 h-screen shrink-0 bg-card",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center",
            collapsed ? "justify-center px-2" : "px-4"
          )}
        >
          <LogoLockup
            href={home}
            size="sm"
            markOnly={collapsed}
            tagline={collapsed ? undefined : "WorkBase"}
          />
        </div>

        {/* Navigation */}
        <nav className="no-scrollbar flex-1 overflow-y-auto px-2 py-4">
          {sections.map((section, i) => (
            <div key={section.heading ?? i} className={cn(i > 0 && "mt-6")}>
              {section.heading && !collapsed && (
                <p className="mb-1.5 px-3 text-xs font-medium text-subtle">
                  {section.heading}
                </p>
              )}
              {section.heading && collapsed && <div className="mb-2 h-2" aria-hidden />}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(pathname, item);
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-primary/[0.09] text-primary"
                          : "text-muted-foreground hover:bg-zone hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse control */}
        <div className="shrink-0 p-2">
          <Button
            variant="ghost"
            size={collapsed ? "icon-sm" : "sm"}
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full text-muted-foreground hover:text-foreground",
              collapsed ? "justify-center" : "justify-start gap-3 px-3"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
