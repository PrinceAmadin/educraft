"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const ADVANCE_MS = 4000;

/**
 * CV samples, one at a time.
 *
 * One CV sits centred on a paper ground with its neighbours partly visible at
 * the sides; every four seconds the set advances with a slow crossfade. With
 * only two samples, the second peeks from the right. Frames load on the paper
 * colour, never on black.
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

  const prev = images[(index - 1 + n) % n];
  const next = images[(index + 1) % n];

  return (
    <div aria-hidden className={cn("relative h-full w-full", className)}>
      {n >= 3 ? <Frame src={prev} className="left-[4%] top-[18%] h-[64%] opacity-45" sizes="120px" /> : null}
      {n >= 2 ? <Frame src={next} className="right-[4%] top-[18%] h-[64%] opacity-45" sizes="120px" /> : null}
      <Frame
        src={images[index]}
        className="left-1/2 top-[8%] z-10 h-[84%] -translate-x-1/2 shadow-[0_14px_30px_-12px_rgb(15_23_42/0.35),0_0_0_1px_rgb(15_23_42/0.06)]"
        sizes="200px"
        priority
      />
    </div>
  );
}

function Frame({
  src,
  className,
  sizes,
  priority = false,
}: {
  src: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("absolute aspect-[1/1.3] overflow-hidden rounded-[3px] bg-paper", className)}>
      <AnimatePresence initial={false}>
        <motion.div
          key={src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 1.1, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <Image src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover object-top" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
