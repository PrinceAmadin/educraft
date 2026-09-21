"use client";

import * as React from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ADVANCE_MS = 3600;

/**
 * CV samples as a fanned stack.
 *
 * Up to five pages are dealt from the whole set: the current one upright at the
 * front, the others fanned behind it, each a little smaller and dimmer. Every
 * few seconds the deck advances a place, so every sample gets its turn at the
 * front. Motion is transform-only and stops under reduced motion.
 */
export function CvCarousel({ images, className }: { images: string[]; className?: string }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const n = images.length;

  React.useEffect(() => {
    if (n < 2 || reduced) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % n), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [n, reduced]);

  if (n === 0) return null;

  // Slot 0 is the front card; slots 1..k fan out behind it alternately right/left.
  const slots = Math.min(n, 5);
  const FAN = [
    { x: 0, r: 0, s: 1, o: 1 },
    { x: 34, r: 7, s: 0.9, o: 0.85 },
    { x: -34, r: -7, s: 0.9, o: 0.85 },
    { x: 62, r: 13, s: 0.8, o: 0.55 },
    { x: -62, r: -13, s: 0.8, o: 0.55 },
  ];

  return (
    <div aria-hidden className={cn("relative h-full w-full", className)}>
      {images.map((src, i) => {
        const slot = (i - index + n) % n;
        const shown = slot < slots;
        const f = FAN[shown ? slot : 0];
        return (
          <div
            key={src}
            className="absolute left-1/2 top-[9%] aspect-[1/1.3] h-[80%] overflow-hidden rounded-[4px] bg-paper shadow-[0_18px_34px_-12px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.08)] transition-[transform,opacity] duration-[900ms] ease-editorial will-change-transform"
            style={{
              transform: `translateX(calc(-50% + ${f.x}%)) rotate(${f.r}deg) scale(${f.s})`,
              opacity: shown ? f.o : 0,
              zIndex: shown ? slots - slot : 0,
            }}
          >
            <Image src={src} alt="" fill sizes="200px" priority={i === 0} className="object-cover object-top" />
          </div>
        );
      })}
    </div>
  );
}
