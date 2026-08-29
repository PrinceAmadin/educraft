import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * EduCraft brand mark.
 *
 * Both theme variants are rendered and swapped with CSS (`dark:` classes)
 * rather than by reading the active theme in JS. next-themes only knows the
 * resolved theme after mount, so a JS swap would either flash the wrong logo
 * or force a client-only render. CSS swapping is server-renderable, has zero
 * flash, and keeps this a server component.
 *
 *   transparent_light_logo.png → light-coloured mark, shown on DARK theme
 *   transparent_dark_logo.png  → dark-coloured mark,  shown on LIGHT theme
 */

export const LOGO_DARK_THEME = "/images/logo/transparent_light_logo.png";
export const LOGO_LIGHT_THEME = "/images/logo/transparent_dark_logo.png";

const sizeMap = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 64,
  xl: 96,
  "2xl": 128,
} as const;

export type LogoSize = keyof typeof sizeMap;

interface LogoProps {
  size?: LogoSize;
  className?: string;
  /** Set on the above-the-fold logo (login, landing hero) to preload it. */
  priority?: boolean;
}

export function Logo({ size = "md", className, priority = false }: LogoProps) {
  const px = sizeMap[size];

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: px, height: px }}
    >
      {/* Light theme → dark-coloured mark */}
      <Image
        src={LOGO_LIGHT_THEME}
        alt="EduCraft"
        width={px}
        height={px}
        priority={priority}
        className="block h-full w-full object-contain dark:hidden"
      />
      {/* Dark theme → light-coloured mark */}
      <Image
        src={LOGO_DARK_THEME}
        alt="EduCraft"
        width={px}
        height={px}
        priority={priority}
        className="hidden h-full w-full object-contain dark:block"
        aria-hidden
      />
    </span>
  );
}

const wordmarkSize: Record<LogoSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-3xl",
  "2xl": "text-4xl",
};

interface LogoLockupProps extends LogoProps {
  /** Wrap the lockup in a link. Pass `null` to render plain (e.g. inside another link). */
  href?: string | null;
  /** Hide the wordmark — for the collapsed sidebar rail. */
  markOnly?: boolean;
  /** Small line under the wordmark, e.g. "WorkBase". */
  tagline?: string;
}

export function LogoLockup({
  size = "sm",
  href = "/",
  markOnly = false,
  tagline,
  className,
  priority,
}: LogoLockupProps) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo size={size} priority={priority} />
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display font-bold tracking-tight text-foreground",
              wordmarkSize[size]
            )}
          >
            Edu<span className="text-primary">Craft</span>
          </span>
          {tagline && (
            <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href === null) return content;

  return (
    <Link
      href={href}
      aria-label="EduCraft home"
      className="rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {content}
    </Link>
  );
}
