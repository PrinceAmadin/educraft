import * as React from "react";
import Link from "next/link";
import { LogoLockup } from "@/components/shared/Logo";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Footer.
 *
 * Continues the closing block's ink ground with no seam between them, so the
 * page ends in one dark mass rather than a statement followed by an unrelated
 * grey slab. Link groups are set as an index — mono headings, hairlines, no
 * boxes — matching the disciplines and the mobile nav.
 */

const GROUPS = [
  {
    heading: "Services",
    links: [
      { label: "Final year projects", href: "/services#projects" },
      { label: "Reports & papers", href: "/services#reports" },
      { label: "Presentations", href: "/services#presentations" },
      { label: "CV & career", href: "/services#career" },
      { label: "Editing & formatting", href: "/services#editing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Ambassadors", href: "/apply" },
      { label: "Track a project", href: "/track" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { label: "07063421088", href: "tel:+2347063421088" },
      { label: "educraft611@gmail.com", href: "mailto:educraft611@gmail.com" },
      { label: "Sign in", href: "/login" },
      { label: "Start a project", href: "/intake" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="ground-ink relative">
      <div className="shell">
        <div className="rule" />

        <div className="grid-12 py-[clamp(3.5rem,8vh,6rem)]">
          <div className="col-span-4 md:col-span-4">
            <LogoLockup href="/" size="md" />
            <p className="mt-6 max-w-measure text-sm leading-relaxed text-muted-foreground">
              EduCraft — Providing Affordable Academic Services
            </p>
          </div>

          <div className="col-span-4 mt-14 grid grid-cols-2 gap-x-6 gap-y-12 md:col-span-7 md:col-start-6 md:mt-0 md:grid-cols-3">
            {GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <p className="index-mark text-subtle">{group.heading.toUpperCase()}</p>
                <ul className="mt-5 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="link-underline text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="rule" />
        <div className="flex flex-col gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="index-mark text-subtle">
            © {new Date().getFullYear()} {BRAND_NAME.toUpperCase()}
          </p>
          <p className="index-mark text-subtle">PROVIDING AFFORDABLE ACADEMIC SERVICES</p>
        </div>
      </div>
    </footer>
  );
}
