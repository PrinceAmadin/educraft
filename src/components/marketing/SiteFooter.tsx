import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { BRAND_NAME } from "@/lib/constants";

const COLUMNS = [
  {
    heading: "Services",
    links: [
      { label: "Final year projects", href: "/services#final-year" },
      { label: "Reports & papers", href: "/services#reports" },
      { label: "Presentations", href: "/services#presentations" },
      { label: "CV & career", href: "/services#career" },
      { label: "Editing & formatting", href: "/services#editing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "How it works", href: "/#process" },
      { label: "Quality standard", href: "/#quality" },
      { label: "Become an ambassador", href: "/apply" },
      { label: "Work with us", href: "/apply#workers" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Client sign in", href: "/client/login" },
      { label: "Pricing", href: "/services" },
      { label: "Referencing guide", href: "/services#editing" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { label: "hello@educraft.ng", href: "mailto:hello@educraft.ng" },
      { label: "WhatsApp", href: "https://wa.me/2347063421088" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden">
      <div className="rule" />

      <div className="shell pb-12 pt-section">
        <div className="grid-12 gap-y-14">
          {/* Wordmark set large — the footer's only display type */}
          <div className="col-span-4 md:col-span-12 lg:col-span-4">
            <Link
              href="/"
              aria-label="EduCraft — home"
              className="group inline-flex items-center gap-3"
            >
              <Logo size="md" />
              <span className="font-display text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-none tracking-[-0.035em] text-foreground">
                Edu<span className="text-primary">Craft</span>
              </span>
            </Link>

            <p className="mt-6 max-w-measure text-[15px] leading-[1.65] text-muted-foreground">
              Academic work, handled properly — for university students across
              Nigeria.
            </p>

            <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-subtle">
              45% to begin · balance on delivery
            </p>
          </div>

          {/* Navigation columns — plain lists, no panels */}
          {COLUMNS.map((col) => (
            <nav
              key={col.heading}
              aria-label={col.heading}
              className="col-span-2 md:col-span-3 lg:col-span-2"
            >
              <h2 className="eyebrow">{col.heading}</h2>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="link-underline inline-block text-[14px] leading-snug text-muted-foreground transition-colors duration-300 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="rule mt-16" />

        <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="font-mono text-[10.5px] tracking-[0.1em] text-subtle">
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {[
              { label: "Terms", href: "/services" },
              { label: "Privacy", href: "/services" },
              { label: "Refund policy", href: "/services" },
            ].map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="link-underline font-mono text-[10.5px] tracking-[0.1em] text-subtle transition-colors duration-300 hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
