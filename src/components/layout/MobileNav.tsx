"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { LogoLockup } from "@/components/shared/Logo";
import { isActive } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { navForRole, type NavRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation for < 768px. Max 5 slots; admin's 5th is a "More" sheet
 * holding every route that doesn't fit.
 */
export function MobileNav({ role }: { role: NavRole }) {
  const pathname = usePathname();
  const { mobile, sections, home } = navForRole(role);
  const [moreOpen, setMoreOpen] = React.useState(false);

  const primaryHrefs = new Set(mobile.map((i) => i.href));
  const overflow = sections
    .flatMap((s) => s.items)
    .filter((i) => !primaryHrefs.has(i.href));

  return (
    <>
      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 bg-card/95 shadow-[0_-10px_30px_-18px_rgb(15_23_42/0.25)] backdrop-blur-md md:hidden"
      >
        <ul className="flex items-stretch">
          {mobile.map((item) => {
            const isMore = item.href === "#more";
            const active = isMore
              ? overflow.some((o) => isActive(pathname, o))
              : isActive(pathname, item);

            const inner = (
              <>
                <item.icon className="h-[22px] w-[22px] shrink-0" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </>
            );

            const className = cn(
              // 56px tall — comfortably above the 44px touch-target minimum
              "flex h-14 w-full flex-col items-center justify-center gap-1 transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            );

            return (
              <li key={item.href} className="flex-1">
                {isMore ? (
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label="More navigation"
                    aria-expanded={moreOpen}
                    className={className}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={className}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <LogoLockup href={home} size="xs" tagline="WorkBase" />
            <SheetTitle className="sr-only">More navigation</SheetTitle>
          </div>

          <ul className="grid grid-cols-2 gap-2 p-4">
            {overflow.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex min-h-[56px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/[0.1] text-primary"
                          : "bg-zone text-foreground hover:bg-elevated"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>

          <div className="pb-safe px-4 pb-4">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
