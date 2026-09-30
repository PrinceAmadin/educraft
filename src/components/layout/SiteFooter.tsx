import * as React from "react";
import Link from "next/link";
import { LogoLockup } from "@/components/shared/Logo";
import { BRAND_NAME } from "@/lib/constants";
import type { HqContact } from "@/lib/services/hq-contact";

/**
 * Footer.
 *
 * A quiet zone one step off the page in either theme — light grey in light
 * mode, a deeper surface in dark — so it reads as the end of the page without
 * a dark slab or a boxed panel. Link groups are plain lists under sentence-case
 * headings. The contact group comes from the HQ contact settings.
 */

function groups(hq: HqContact) {
  return [
    {
      heading: "Services",
      links: [
        { label: "Final year projects", href: "/services" },
        { label: "Reports & papers", href: "/services" },
        { label: "Presentations", href: "/services" },
        { label: "Letters & essays", href: "/services" },
        { label: "Editing & formatting", href: "/services" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "How it works", href: "/#how-it-works" },
        { label: "Become an ambassador", href: "/apply" },
        { label: "Work with us", href: "/apply/worker" },
        { label: "Client sign in", href: "/client/login" },
        { label: "Sign in", href: "/login" },
      ],
    },
    {
      heading: "Contact",
      links: [
        { label: hq.phone, href: `tel:+${hq.whatsapp}` },
        { label: "WhatsApp us", href: hq.whatsappUrl },
        { label: hq.email, href: `mailto:${hq.email}` },
        ...(hq.telegram ? [{ label: `Telegram @${hq.telegram}`, href: `https://t.me/${hq.telegram}` }] : []),
        { label: "Start a project", href: "/intake" },
      ],
    },
  ];
}

export function SiteFooter({ hq }: { hq: HqContact }) {
  return (
    <footer className="bg-zone">
      <div className="shell">
        <div className="grid-12 gap-y-12 py-[clamp(3.5rem,8vh,5.5rem)]">
          <div className="col-span-4 md:col-span-5">
            <LogoLockup href="/" size="md" />
            <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
              EduCraft — Providing Affordable Academic Services
            </p>
            {hq.address ? <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">{hq.address}</p> : null}
          </div>

          <div className="col-span-4 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:col-span-7">
            {groups(hq).map((group) => (
              <nav
                key={group.heading}
                aria-label={group.heading}
                // The email address is too long for half a 375px row — give
                // Contact the full width until the columns go three-up.
                className={group.heading === "Contact" ? "col-span-2 sm:col-span-1" : undefined}
              >
                <p className="text-[13px] font-semibold text-foreground">{group.heading}</p>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => {
                    const external = link.href.startsWith("http");
                    return (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                          className="link-underline break-words text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-7 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </p>
          <p>Academic &amp; technical documentation experts.</p>
        </div>
      </div>
    </footer>
  );
}
