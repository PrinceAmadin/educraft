import * as React from "react";
import { ActionLink } from "@/components/primitives/ActionLink";
import { DisplayHeading, Eyebrow, Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { BentoCell } from "@/components/marketing/BentoCell";
import { SERVICES } from "@/lib/marketing";
import { listSamplesFrom } from "@/lib/work-samples";

/**
 * Services, as a bento.
 *
 * The previous catalogue described the work; this shows it. Cell size does the
 * ranking that a price column used to — Final Year Projects holds a quarter of
 * the field and everything else sizes down from there — so the grid is
 * art-directed rather than a uniform tile wall.
 *
 * Prices are deliberately absent. This section is a portfolio; the number
 * belongs on the services page where it can sit beside what it buys.
 *
 * Folder reads happen here, on the server, at build time. The client cells
 * receive plain URL arrays and never touch the filesystem.
 */

/** Which folders feed each cell, and where the cell sits in the grid. */
const LAYOUT: Record<
  string,
  { dirs: string[]; area: string; sizes: string; emphasis?: boolean; media?: "photo" | "cv" }
> = {
  "final-year": {
    dirs: ["fyb_img"],
    // Flagship: two columns wide, two rows tall.
    area: "lg:col-span-2 lg:row-span-2 min-h-[280px] sm:min-h-0 lg:min-h-[404px]",
    sizes: "(min-width: 1024px) 66vw, (min-width: 640px) 50vw, 100vw",
    emphasis: true,
  },
  reports: {
    dirs: ["report_img"],
    area: "lg:col-span-1 lg:row-span-1 min-h-[200px] sm:min-h-0 lg:min-h-[200px]",
    sizes: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  },
  presentations: {
    dirs: ["ppt_img"],
    area: "lg:col-span-1 lg:row-span-1 min-h-[200px] sm:min-h-0 lg:min-h-[200px]",
    sizes: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  },
  career: {
    dirs: ["cv_img"],
    area: "lg:col-span-1 lg:row-span-1 min-h-[220px] sm:min-h-0 lg:min-h-[190px]",
    sizes: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
    // CVs are pages, not photographs — paper ground, centred carousel.
    media: "cv",
  },
  editing: {
    dirs: ["report_img", "fyb_img"],
    area: "lg:col-span-2 lg:row-span-1 min-h-[200px] sm:min-h-0 lg:min-h-[190px]",
    sizes: "(min-width: 1024px) 66vw, (min-width: 640px) 50vw, 100vw",
  },
  combined: {
    dirs: ["fyb_img"],
    area: "lg:col-span-3 lg:row-span-1 min-h-[200px] sm:min-h-0 lg:min-h-[190px]",
    sizes: "100vw",
  },
};

/** Trimmed for the tile — the row copy was written for a wider measure. */
const CELL_COPY: Record<string, string> = {
  "final-year": "Full five-chapter reports, proposals and data analysis.",
  reports: "Seminar, IT and term papers.",
  presentations: "Defence and class decks.",
  career: "CVs, résumés and profiles.",
  editing: "Proofreading, editing and department formatting.",
  combined: "Proposal, report and defence deck, bundled.",
};

export function ServiceBento() {
  return (
    <Section id="services" ground="into-b" rhythm="normal">
      <div className="shell">
        {/* ── Header, unchanged in structure ── */}
        <div className="grid-12 items-end">
          <Reveal className="col-span-4 md:col-span-6">
            <Eyebrow index="01">What we do</Eyebrow>
            <DisplayHeading
              className="mt-7"
              scale="display-sm"
              lines={["Every deliverable,", "one place."]}
            />
          </Reveal>

          <Reveal delay={110} className="col-span-4 mt-8 md:col-span-4 md:col-start-9 md:mt-0">
            <p className="max-w-measure text-[0.9375rem] leading-relaxed text-muted-foreground md:text-right">
              Pick a service, fill one short form, and a specialist in your field
              takes it from there.
            </p>
          </Reveal>
        </div>

        {/* ── The bento ──
            One column on phones, two on tablets at equal height, and the
            art-directed three-column composition from md up. */}
        <Reveal delay={60}>
          <div
            className={[
              "mt-14 grid gap-1 md:mt-20",
              "grid-cols-1",
              // Tablet: two equal columns, every cell the same height.
              "sm:grid-cols-2 sm:auto-rows-[240px]",
              // Desktop: the art-directed three-column composition.
              "lg:grid-cols-3 lg:auto-rows-[200px]",
            ].join(" ")}
          >
            {SERVICES.map((service, i) => {
              const config = LAYOUT[service.id];
              if (!config) return null;

              return (
                <BentoCell
                  key={service.id}
                  title={service.title}
                  description={CELL_COPY[service.id] ?? service.body}
                  href={service.href}
                  icon={<service.icon className="size-5 md:size-[22px]" />}
                  images={listSamplesFrom(config.dirs)}
                  order={i}
                  sizes={config.sizes}
                  emphasis={config.emphasis}
                  media={config.media}
                  className={config.area}
                />
              );
            })}
          </div>
        </Reveal>

        {/* ── One action, centred beneath the field ── */}
        <Reveal delay={80}>
          <div className="mt-12 flex justify-center md:mt-14">
            <ActionLink href="/intake" variant="primary" magnetic>
              Start your project
            </ActionLink>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
