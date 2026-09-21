"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { IconArrow } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Actions.
 *
 * The primary action carries a cut bottom-right corner — the founder's
 * preferred button, kept deliberately. (A shadow would be clipped by it.)
 *
 * Secondary actions have no container at all. They are type plus a rule that
 * draws in on hover, which is enough separation at this scale.
 */

export const CUT_CORNER =
  "[clip-path:polygon(0_0,100%_0,100%_calc(100%-11px),calc(100%-11px)_100%,0_100%)]";

/* ── Magnetic wrapper ─────────────────────────────────────────
   Pointer proximity displaces the element by a fraction of the
   cursor offset, resolved by a spring so it settles rather than
   tracking. Fine pointers only — on touch there is no proximity
   to respond to, and the transform would only cost frames. */

export function Magnetic({
  children,
  strength = 0.28,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = React.useState(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 190, damping: 17, mass: 0.35 });
  const y = useSpring(rawY, { stiffness: 190, damping: 17, mass: 0.35 });

  React.useEffect(() => {
    setEnabled(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const active = enabled && !reduced;

  const onMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!active || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    rawX.set((event.clientX - (box.left + box.width / 2)) * strength);
    rawY.set((event.clientY - (box.top + box.height / 2)) * strength);
  };

  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onBlur={reset}
      style={active ? { x, y } : undefined}
      className={cn("inline-flex", className)}
    >
      {children}
    </motion.span>
  );
}

/* ── Travelling arrow ─────────────────────────────────────────
   Clipped to its own box so the glyph leaves the frame on hover
   and a second copy enters behind it — continuous, not a nudge. */

export function TravelArrow({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative block overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <IconArrow
        className="absolute inset-0 transition-transform duration-normal ease-editorial group-hover/action:translate-x-full group-hover/action:-translate-y-full group-focus-visible/action:translate-x-full group-focus-visible/action:-translate-y-full"
        style={{ width: size, height: size }}
      />
      <IconArrow
        className="absolute inset-0 -translate-x-full translate-y-full transition-transform duration-normal ease-editorial group-hover/action:translate-x-0 group-hover/action:translate-y-0 group-focus-visible/action:translate-x-0 group-focus-visible/action:translate-y-0"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

/* ── Action link ──────────────────────────────────────────── */

type ActionVariant = "primary" | "quiet" | "inverse";

interface ActionLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: ActionVariant;
  /** Magnetic response. Reserved for the page's two primary calls to action. */
  magnetic?: boolean;
  className?: string;
}

export function ActionLink({
  href,
  children,
  variant = "quiet",
  magnetic = false,
  className,
}: ActionLinkProps) {
  const shared =
    "group/action relative inline-flex shrink-0 items-center gap-3 whitespace-nowrap font-medium transition-colors duration-fast";

  const body =
    variant === "quiet" ? (
      <Link
        href={href}
        className={cn(
          shared,
          "text-[0.9375rem] text-foreground/85 hover:text-foreground",
          className
        )}
      >
        <span className="link-underline">{children}</span>
        <TravelArrow size={16} className="text-primary" />
      </Link>
    ) : (
      <Link
        href={href}
        className={cn(
          shared,
          CUT_CORNER,
          "h-12 px-6 text-[0.9375rem]",
          variant === "primary"
            ? "bg-primary text-primary-foreground hover:bg-primary-hover"
            : "bg-[hsl(40_24%_97%)] text-[hsl(224_52%_5%)] hover:bg-white",
          className
        )}
      >
        {children}
        <TravelArrow size={17} />
      </Link>
    );

  return magnetic ? <Magnetic>{body}</Magnetic> : body;
}
