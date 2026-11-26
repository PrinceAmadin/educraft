import { DisplayHeading, Section } from "@/components/primitives/Section";
import { ActionLink } from "@/components/primitives/ActionLink";
import { Reveal } from "@/components/primitives/Reveal";
import { JOIN_TEXT } from "@/lib/ambassadors/ambassador-copy";

/**
 * The close. One statement, one button, nothing else — and the sentinel the
 * sticky bar watches, so the bar steps aside here rather than competing with
 * the largest version of the same button.
 */
export function JoinClose({ ctaHref }: { ctaHref: string }) {
  const t = JOIN_TEXT.close;
  return (
    <Section ground="ink" rhythm="open" grain id="join-close-sentinel">
      <div className="shell">
        <div className="shell-column max-w-[46rem] px-0">
          <Reveal variant="wipe">
            <DisplayHeading lines={[...t.heading]} scale="display-sm" />
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-8 max-w-[48ch] text-lead text-muted-foreground">{t.body}</p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-11">
              <ActionLink href={ctaHref} variant="primary" magnetic>
                {t.cta}
              </ActionLink>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
