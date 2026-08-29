import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ScrollNav } from "@/components/marketing/ScrollNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/*
        Scroll reveals are opt-in and animate from a hidden state. If the JS
        bundle never arrives, this drops every element straight to its final
        state — the page reads completely without a single byte of script.
      */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}`}</style>
      </noscript>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-modal focus:bg-primary focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteHeader />

      {/* The header is fixed so the hero can run under it; the offset lives
          here rather than as padding inside every section. */}
      <main id="main" className="flex-1 pt-[4.5rem]">
        {children}
      </main>

      <ScrollNav />

      <SiteFooter />
    </div>
  );
}
