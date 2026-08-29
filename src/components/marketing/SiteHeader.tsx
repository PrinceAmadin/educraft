"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Services", href: "/services" },
  { label: "Track project", href: "/track" },
  { label: "Ambassadors", href: "/apply" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page while the mobile sheet is open
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter] duration-500 ease-editorial",
        scrolled ? "bg-background/[0.72] backdrop-blur-xl backdrop-saturate-150" : "bg-transparent"
      )}
    >
      {/* Hairline appears only once the page has moved */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-px origin-left bg-hairline/[0.12] transition-transform duration-700 ease-editorial",
          scrolled ? "scale-x-100" : "scale-x-0"
        )}
      />

      <div className="shell flex h-[72px] items-center gap-8">
        <Link
          href="/"
          aria-label="EduCraft — home"
          className="group flex items-center gap-2.5 outline-none"
        >
          <Logo size="sm" priority />
          <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
            Edu<span className="text-primary">Craft</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative inline-flex items-center px-3.5 py-2 text-[13.5px] tracking-tight transition-colors duration-300",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                    {/* Active state is a teal tick, not a filled pill */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-3.5 -bottom-0.5 h-px origin-left bg-primary transition-transform duration-400 ease-editorial",
                        active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />

          <Link
            href="/login"
            className="hidden px-3.5 py-2 text-[13.5px] tracking-tight text-muted-foreground transition-colors duration-300 hover:text-foreground sm:inline-block"
          >
            Sign in
          </Link>

          <PrimaryAction href="/intake" className="hidden sm:inline-flex">
            Start a project
          </PrimaryAction>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-foreground lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet — typographic, not a card stack */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-[72px] bottom-0 z-40 bg-background/[0.97] backdrop-blur-xl lg:hidden"
      >
        <nav aria-label="Mobile" className="shell flex h-full flex-col pt-10">
          <ul className="space-y-1">
            {NAV.map((item, i) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-baseline gap-4 py-4 text-headline-sm tracking-tight text-foreground"
                >
                  <span className="index-mark text-subtle">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </Link>
                <div className="rule" />
              </li>
            ))}
            <li>
              <Link
                href="/login"
                className="flex items-baseline gap-4 py-4 text-headline-sm tracking-tight text-foreground"
              >
                <span className="index-mark text-subtle">04</span>
                Sign in
              </Link>
              <div className="rule" />
            </li>
          </ul>

          <div className="mt-auto flex items-center justify-between gap-4 pb-10 pt-8">
            <PrimaryAction href="/intake">Start a project</PrimaryAction>
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}

/**
 * The one solid button on the page. Modest radius, quiet lift, arrow that
 * travels — no pill, no gradient, no shadow stack.
 */
export function PrimaryAction({
  href,
  children,
  className,
  size = "sm",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden rounded-[5px] bg-primary tracking-tight text-primary-foreground",
        "transition-[transform,background-color] duration-300 ease-editorial hover:bg-primary-hover active:scale-[0.985]",
        size === "lg"
          ? "px-6 py-3.5 text-[15px] font-medium"
          : "px-4 py-2.5 text-[13.5px] font-medium",
        className
      )}
    >
      <span className="relative z-10">{children}</span>
      <ArrowUpRight
        className={cn(
          "relative z-10 shrink-0 transition-transform duration-400 ease-editorial",
          "group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
          size === "lg" ? "h-[18px] w-[18px]" : "h-4 w-4"
        )}
      />
      {/* Sheen sweeps once on hover — 500ms, no loop */}
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.18] to-transparent transition-transform duration-500 ease-editorial group-hover:translate-x-full"
      />
    </Link>
  );
}

/** Quiet secondary action — text plus a rule that extends on hover. */
export function GhostAction({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 py-3.5 text-[15px] tracking-tight text-foreground",
        className
      )}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-foreground/40 transition-transform duration-400 ease-editorial group-hover:scale-x-100"
        />
      </span>
      <span
        aria-hidden
        className="h-px w-6 bg-foreground/25 transition-all duration-400 ease-editorial group-hover:w-9 group-hover:bg-primary"
      />
    </Link>
  );
}
