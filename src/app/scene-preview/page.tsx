"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSceneStore } from "@/lib/scene/store";
import type { SceneState } from "@/lib/scene/composition";

/**
 * Standalone harness for the document scene.
 *
 * The WebGL layer is deliberately not wired into the marketing page from here
 * — this route exists so the system can be judged on its own: the composition,
 * the entrance, the pointer field, and the state machine that reorganises the
 * sheets per service.
 *
 * It is also the integration example. Mounting the scene anywhere is these two
 * things: a positioned container whose ref supplies scroll progress, and a
 * `focus`/`release` pair on whatever the user is pointing at.
 */

const EduCraftScene = dynamic(
  () => import("@/components/3d/EduCraftScene").then((m) => m.EduCraftScene),
  {
    ssr: false,
    // three + fiber are ~150KB. They are never on the critical path: the type
    // below is the LCP element and renders without any of this.
    loading: () => null,
  },
);

const SERVICES: { index: string; label: string; price: string; state: SceneState }[] = [
  { index: "01", label: "Final year projects", price: "from ₦70,000", state: "projects" },
  { index: "02", label: "Reports & papers", price: "from ₦10,000", state: "reports" },
  { index: "03", label: "Presentations", price: "from ₦8,000", state: "presentations" },
  { index: "04", label: "CV & career", price: "from ₦8,000", state: "career" },
  { index: "05", label: "Editing & formatting", price: "from ₦5,000", state: "editing" },
  { index: "06", label: "Combos", price: "from ₦85,000", state: "combos" },
];

export default function ScenePreviewPage() {
  const hero = React.useRef<HTMLElement>(null);
  const focus = useSceneStore((s) => s.focus);
  const release = useSceneStore((s) => s.release);
  const active = useSceneStore((s) => s.state);

  return (
    <main className="bg-background text-foreground">
      <section
        ref={hero}
        className="relative isolate min-h-[100svh] overflow-hidden"
      >
        {/* The canvas. Absolute on desktop, a band under the type on phones —
            one instance either way; a second copy behind a `hidden` class would
            still allocate a second WebGL context. */}
        <EduCraftScene
          progressRef={hero}
          className="pointer-events-none absolute inset-x-0 top-[46svh] bottom-0 z-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[56%]"
        />

        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-4 gap-x-6 px-[clamp(1.25rem,5vw,5rem)] pb-24 pt-[clamp(5rem,14vh,9rem)] md:grid-cols-12">
          <div className="col-span-4 md:col-span-7">
            <p className="flex items-center gap-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-subtle">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              Scene preview · not wired into the site
            </p>

            <h1 className="mt-8 font-display text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.04em]">
              <span className="block">Academic work,</span>
              <span className="block">
                held to a <span className="font-serif italic font-normal text-primary">standard</span>.
              </span>
            </h1>

            <p className="mt-9 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
              Point at a service. The composition reorganises the same seven
              sheets into the structure that service actually produces — a
              chapter ladder, a bound document, a deck, a single page, a marked
              proof, a bundle. Nothing is labelled; the geometry carries it.
            </p>

            <ul className="mt-12 max-w-[34rem] border-t border-border">
              {SERVICES.map((service) => {
                const isActive = active === service.state;
                return (
                  <li key={service.state} className="border-b border-border">
                    <button
                      type="button"
                      className="group flex w-full items-baseline gap-4 py-4 text-left outline-none transition-colors"
                      onPointerEnter={() => focus(service.state, service.index)}
                      onPointerLeave={() => release(service.index)}
                      onFocus={() => focus(service.state, service.index)}
                      onBlur={() => release(service.index)}
                    >
                      <span
                        className={
                          "font-mono text-[0.6875rem] tabular-nums tracking-[0.12em] transition-colors " +
                          (isActive ? "text-primary" : "text-subtle")
                        }
                      >
                        {service.index}
                      </span>
                      <span
                        className={
                          "flex-1 text-base transition-colors " +
                          (isActive ? "text-foreground" : "text-muted-foreground")
                        }
                      >
                        {service.label}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gold">
                        {service.price}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* Scroll runway, so the scroll response on the camera and the group can
          actually be evaluated. */}
      <section className="mx-auto flex min-h-[70svh] w-full max-w-[1440px] items-start px-[clamp(1.25rem,5vw,5rem)] py-24">
        <p className="max-w-[52ch] text-sm leading-relaxed text-subtle">
          Scrolling past the hero tips the composition towards a plan view,
          lifts it, and dollies the lens back — the document is handed over
          rather than cut away. Below this point the canvas stops rendering
          entirely.
        </p>
      </section>
    </main>
  );
}
