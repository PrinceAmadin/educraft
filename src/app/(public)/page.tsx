import { ClosingCta } from "@/components/marketing/ClosingCta";
import { Expertise } from "@/components/marketing/Expertise";
import { Hero } from "@/components/marketing/Hero";
import { Ledger } from "@/components/marketing/Ledger";
import { ProcessTimeline } from "@/components/marketing/ProcessTimeline";
import { QualityControl } from "@/components/marketing/QualityControl";
import { ServiceBento } from "@/components/marketing/ServiceBento";
import { TestimonialStage } from "@/components/marketing/TestimonialStage";

/**
 * Homepage composition.
 *
 * Read this list as the page's rhythm rather than as a stack of sections —
 * ground, density and composition all change from one to the next, and no two
 * adjacent sections are built the same way:
 *
 *   Hero        A      immersive   asymmetric 12-col, interactive 3D stack
 *   Ledger      B      quiet       editorial data index
 *   Services    A      dense       bento of real work
 *   Process     B      open        spatial timeline, sticky stage
 *   Expertise   A      dense       typographic index
 *   Quality     B      open        annotated document
 *   Voice       A      quiet       one dominant quote
 *
 * Grounds alternate strictly A/B (B is teal-tinted), so every section edge is
 * visible without a border.
 *   Closing     ink    immersive   full-bleed statement
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Ledger />
      <ServiceBento />
      <ProcessTimeline />
      <Expertise />
      <QualityControl />
      <TestimonialStage />
      <ClosingCta />
    </>
  );
}
