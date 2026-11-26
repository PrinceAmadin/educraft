import { DisplayHeading, Section } from "@/components/primitives/Section";
import { ActionLink } from "@/components/primitives/ActionLink";
import { Reveal } from "@/components/primitives/Reveal";
import { HookVideo } from "@/components/join/HookVideo";
import { JOIN_TEXT } from "@/lib/ambassadors/ambassador-copy";

/**
 * The fold.
 *
 * Whoever is reading this scanned a card after meeting someone from EduCraft,
 * so they are checking the company is real, not learning about it for the
 * first time. Two things lose them: being pitched again from zero, and having
 * to hunt for the button. So the fold is the position, the promise, the button
 * — and the top of the video frame, which says there is a film and that it
 * costs one flick of the thumb.
 *
 * The video is deliberately NOT the whole fold. A phone-shaped frame at full
 * width is taller than the visible part of a phone screen, so it would push
 * the button off the one screen where it must not be.
 *
 * It never opens with "welcome" or "thanks for scanning": plenty of people
 * scan days after the conversation.
 */
export function JoinHero({
  ctaHref,
  topRate,
  positions,
  video,
}: {
  ctaHref: string;
  topRate: number | null;
  positions: { open: number; total: number } | null;
  video: { src: string; poster: string } | null;
}) {
  const t = JOIN_TEXT.hero;

  // Never "0 positions open": at zero the line changes and the button stays.
  const eyebrow =
    positions && positions.open > 0 ? t.openPositions(positions.open, positions.total) : t.noPositions;

  return (
    <Section ground="a" grain rhythm="tight" className="-mt-[4.5rem] pt-[calc(4.5rem+clamp(2.5rem,6vh,4.5rem))]">
      <div aria-hidden className="ambient-teal absolute inset-0 -z-10" />
      <div className="shell">
        <div className="grid-12 items-center gap-y-10">
          <div className="col-span-4 md:col-span-7 lg:col-span-6">
            <Reveal>
              <p className="eyebrow text-primary">{eyebrow}</p>
            </Reveal>
            <Reveal delay={60}>
              <DisplayHeading as="h1" lines={[...t.headline]} scale="display-sm" className="mt-5" />
            </Reveal>
            {topRate !== null ? (
              <Reveal delay={120}>
                <p className="mt-6 max-w-[46ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
                  {t.promise(topRate)}
                </p>
              </Reveal>
            ) : null}
            <Reveal delay={180}>
              <div id="join-cta-sentinel" className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                <ActionLink href={ctaHref} variant="primary" magnetic>
                  {t.cta}
                </ActionLink>
                <ActionLink href="#money">{t.secondary}</ActionLink>
              </div>
            </Reveal>
          </div>

          {video ? (
            <div className="col-span-4 md:col-span-5 lg:col-span-4 lg:col-start-9">
              <HookVideo
                src={video.src}
                poster={video.poster}
                label={JOIN_TEXT.video.label}
                tapForSound="Tap for sound"
              />
              <p className="meta-label mt-3 text-center">{JOIN_TEXT.video.label}</p>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
