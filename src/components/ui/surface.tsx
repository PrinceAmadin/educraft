import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Surface — the UI Constitution's replacement for the bordered card.
 *
 * Ask of every element: can whitespace alone separate it? If not, a zone
 * (background band). If not, a raised surface (fill + soft shadow). A border
 * is never the answer here — that is what `border-border` is left for.
 *
 *   raised  white on the page, soft shadow        — panels that float
 *   zone    one step off the page, no shadow      — stats, pipeline, activity bands
 *   plain   no fill at all                        — layout only, keeps the padding scale
 */
const surfaceVariants = cva("text-card-foreground", {
  variants: {
    tone: {
      raised: "rounded-xl bg-card shadow-soft",
      zone: "rounded-2xl bg-zone",
      plain: "",
    },
    padding: {
      none: "",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-5",
      lg: "p-5 sm:p-7",
    },
  },
  defaultVariants: { tone: "raised", padding: "md" },
});

type SurfaceElement = "div" | "section" | "article" | "aside" | "header" | "footer";

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof surfaceVariants> {
  as?: SurfaceElement;
}

const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  ({ as: Comp = "div", tone, padding, className, ...props }, ref) => (
    <Comp
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(surfaceVariants({ tone, padding }), className)}
      {...props}
    />
  )
);
Surface.displayName = "Surface";

/**
 * Heading row for a surface or zone: a sentence-case title, optional supporting
 * line, and an optional action on the right. Replaces the old uppercase
 * `CardTitle` pattern.
 */
function SurfaceHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <Heading className="text-[15px] font-semibold leading-tight text-foreground">
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { Surface, SurfaceHeader, surfaceVariants };
