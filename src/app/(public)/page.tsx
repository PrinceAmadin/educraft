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
 *   Hero        A      immersive   asymmetric 12-col, 3D bleed
 *   Ledger      A      quiet       editorial data index
 *   Services    A→B    dense       catalogue rows, broken grid
 *   Process     B      open        spatial timeline, sticky stage
 *   Expertise   B→A    dense       typographic index
 *   Quality     A→B    open        annotated document
 *   Voice       B      quiet       one dominant quote
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
