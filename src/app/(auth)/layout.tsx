import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { PaperStack } from "@/components/marketing/scene/PaperStack";

/**
 * Sign-in shell. Desktop is a split: the brand on a quiet zone to the left,
 * the form on the page to the right — the layout does the separating, so there
 * is no divider and no card. Phones get the form alone.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* ── Brand (desktop only) ── */}
      <aside className="relative hidden overflow-hidden bg-zone lg:flex lg:min-h-screen lg:flex-col lg:p-12 xl:p-16">
        <div aria-hidden className="ambient-teal pointer-events-none absolute inset-0" />

        <Link href="/" aria-label="EduCraft home" className="relative w-fit">
          <Logo size="md" priority />
        </Link>

        <div className="relative mt-[clamp(3rem,10vh,6rem)]">
          <p className="whitespace-nowrap font-sans text-[clamp(2.75rem,4.4vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-foreground">
            Edu<span className="accent-serif text-[1.08em] text-primary">Craft</span>
          </p>
          <p className="mt-6 max-w-[16ch] font-display text-[clamp(1.5rem,2.3vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
            Academic work, professionally delivered.
          </p>
        </div>

        <div className="relative mt-auto h-[clamp(220px,36vh,360px)] w-full max-w-[520px]">
          <PaperStack />
        </div>
      </aside>

      {/* ── Form ── */}
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-4 py-4 md:px-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LuArrowLeft className="size-4" aria-hidden />
            Back to site
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
