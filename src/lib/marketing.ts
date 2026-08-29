import {
  IconBrief,
  IconBundle,
  IconCareer,
  IconDelivery,
  IconEditing,
  IconProject,
  IconQuality,
  IconReport,
  IconResearch,
  IconSlides,
  IconSpecialists,
  type AppIcon,
} from "@/lib/icons";
import { DOWNPAYMENT_PERCENTAGE, MAX_REVISIONS } from "@/lib/constants";

/**
 * Marketing content model.
 *
 * The homepage renders composition; the words live here. Prices and business
 * rules are the ones already committed in `constants.ts` and the previous
 * landing page — nothing here invents a claim the business hasn't made.
 */

/* ── Ledger ─────────────────────────────────────────────────
   Read as an index, not four equal tiles: the entries carry
   different weights because they are not equally interesting. */

export interface LedgerEntry {
  /** The number the counter animates to. */
  to: number;
  /** Decimal places to hold while counting — 4.5 must not render as 5. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  /** Sets the type scale. One lead entry per row, the rest support it. */
  weight: "lead" | "support";
}

export const LEDGER: LedgerEntry[] = [
  { to: 90, suffix: "+", label: "Projects delivered", weight: "lead" },
  { to: 10, suffix: "+", label: "Universities covered", weight: "support" },
  { to: 95, suffix: "%", label: "On-time delivery", weight: "support" },
  { to: 4.5, decimals: 1, label: "Average rating out of 5", weight: "support" },
];

/* ── Service catalogue ──────────────────────────────────────
   Rows, not cards. `scope` is the broken-grid right column: a
   factual description of what the deliverable contains — never
   a turnaround promise the business hasn't made. */

export interface Service {
  /** Stable key — also selects the work-sample folder in `lib/work-samples`. */
  id: string;
  index: string;
  title: string;
  price: string;
  body: string;
  scope: string;
  icon: AppIcon;
  href: string;
}

export const SERVICES: Service[] = [
  {
    id: "final-year",
    index: "01",
    title: "Final Year Projects",
    price: "from ₦70,000",
    body: "Full five-chapter reports, proposals and data analysis, matched to your department's format.",
    scope: "Proposal · 5 chapters · Analysis",
    icon: IconProject,
    href: "/services#projects",
  },
  {
    id: "reports",
    index: "02",
    title: "Reports & Papers",
    price: "from ₦10,000",
    body: "Seminar reports, IT reports, term papers, case studies and assignment-based reports.",
    scope: "Seminar · IT · Term paper",
    icon: IconReport,
    href: "/services#reports",
  },
  {
    id: "presentations",
    index: "03",
    title: "Presentations",
    price: "from ₦8,000",
    body: "Defence decks and class presentations — design only, or design with the written content.",
    scope: "Defence · Class · Design-only",
    icon: IconSlides,
    href: "/services#presentations",
  },
  {
    id: "career",
    index: "04",
    title: "CV & Career",
    price: "from ₦8,000",
    body: "Professional CVs, résumés and profiles built to get you past the first screen.",
    scope: "CV · Résumé · Profile",
    icon: IconCareer,
    href: "/services#career",
  },
  {
    id: "editing",
    index: "05",
    title: "Editing & Formatting",
    price: "from ₦5,000",
    body: "Proofreading, full editing and department-standard formatting for work you've already written.",
    scope: "Proofread · Edit · Format",
    icon: IconEditing,
    href: "/services#editing",
  },
  {
    id: "combined",
    index: "06",
    title: "Combined Packages",
    price: "from ₦85,000",
    body: "Proposal, report and defence deck bundled together for less than the parts.",
    scope: "Proposal + Report + Deck",
    icon: IconBundle,
    href: "/services#packages",
  },
];

/* ── Process ────────────────────────────────────────────────
   A spatial timeline. Every claim below is one the business has
   already published: the 45% downpayment, specialist matching,
   mandatory quality review, and in-scope corrections. */

export interface ProcessStep {
  index: string;
  title: string;
  body: string;
  meta: string;
  icon: AppIcon;
}

export const PROCESS: ProcessStep[] = [
  {
    index: "01",
    title: "Brief",
    body: "EduCraft form captures your topic, supervisor, department format and any files you already have. No unnecessary back-and-forth on WhatsApp.",
    meta: "You · 5 minutes",
    icon: IconBrief,
  },
  {
    index: "02",
    title: "Specialist",
    body: `A writer who works inside your discipline is assigned to the project. Work begins on a ${DOWNPAYMENT_PERCENTAGE}% downpayment — the balance is only due at the end.`,
    meta: `EduCraft · ${DOWNPAYMENT_PERCENTAGE}% to start`,
    icon: IconSpecialists,
  },
  {
    index: "03",
    title: "Research",
    body: "Sources are gathered, read and cited properly. Data analysis, where the project calls for it, is done against your actual dataset.",
    meta: "Specialist · In progress",
    icon: IconResearch,
  },
  {
    index: "04",
    title: "Quality review",
    body: "Nothing reaches you unchecked. References, structure and department formatting are reviewed against your requirements before release.",
    meta: "Reviewer · Mandatory gate",
    icon: IconQuality,
  },
  {
    index: "05",
    title: "Delivery",
    body: `Pay the balance and download the finished work. Supervisor corrections within the agreed scope are handled — up to ${MAX_REVISIONS} rounds.`,
    meta: `You · ${MAX_REVISIONS} revision rounds`,
    icon: IconDelivery,
  },
];

/* ── Disciplines ────────────────────────────────────────────
   Set as an index, not as pills. The sub-line is a breakdown of
   the field itself, so hovering adds information rather than
   decoration. */

export interface Discipline {
  name: string;
  fields: string;
}

export const DISCIPLINES: Discipline[] = [
  { name: "Engineering", fields: "Mechanical · Civil · Electrical · Chemical · Petroleum" },
  { name: "Medicine & Health", fields: "Nursing · Public Health · Anatomy · Physiology" },
  { name: "Computer Science", fields: "Software · Networks · Data · Information Systems" },
  { name: "Business", fields: "Accounting · Marketing · Banking & Finance · Management" },
  { name: "Law", fields: "Constitutional · Commercial · International · Jurisprudence" },
  { name: "Social Sciences", fields: "Economics · Sociology · Political Science · Psychology" },
  { name: "Education", fields: "Curriculum · Guidance & Counselling · Educational Management" },
  { name: "Agriculture", fields: "Agronomy · Animal Science · Soil Science · Extension" },
];

/* ── Quality control ────────────────────────────────────────
   Editorial annotations pinned around the document composition.
   `at` is a percentage coordinate on the composition box. */

export interface Annotation {
  id: string;
  label: string;
  note: string;
  /** Percentage coordinates within the composition, and which side the leader line runs. */
  at: { top: string; side: "left" | "right" };
}

export const ANNOTATIONS: Annotation[] = [
  {
    id: "A",
    label: "Research verified",
    note: "Every source located and read, not scraped from a citation list.",
    at: { top: "14%", side: "left" },
  },
  {
    id: "B",
    label: "References checked",
    note: "Citations matched to the referencing style your department requires.",
    at: { top: "41%", side: "right" },
  },
  {
    id: "C",
    label: "Format reviewed",
    note: "Margins, headings, captions and pagination against your handbook.",
    at: { top: "62%", side: "left" },
  },
  {
    id: "D",
    label: "Department requirements",
    note: "Chapter structure checked against what your faculty actually accepts.",
    at: { top: "84%", side: "right" },
  },
];

/* ── Testimonials ───────────────────────────────────────────
   PLACEHOLDER COPY — REPLACE BEFORE LAUNCH.
   These are deliberately non-attributed (initials and a region,
   never an invented full name) so nothing here can be mistaken
   for a real review. Swap in genuine, permissioned quotes with
   real attribution before this page goes public. */

export interface Testimonial {
  quote: string;
  initials: string;
  programme: string;
  institution: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I sent the brief once and stopped chasing anyone. The chapters came back in my department's format, with references I could actually open.",
    initials: "A. O.",
    programme: "Final year, Mechanical Engineering",
    institution: "Federal university, South-West",
  },
  {
    quote:
      "My supervisor asked for corrections twice. Both times they came back handled properly, without an argument about scope.",
    initials: "C. E.",
    programme: "Final year, Accounting",
    institution: "State university, South-East",
  },
  {
    quote:
      "The defence deck matched the report instead of repeating it. That was the difference in the room.",
    initials: "M. I.",
    programme: "Final year, Public Health",
    institution: "Federal university, North-Central",
  },
  {
    quote:
      "Paying part of it up front made the whole thing feel like a transaction with an actual company, not a favour from a stranger.",
    initials: "T. A.",
    programme: "Final year, Computer Science",
    institution: "Private university, South-West",
  },
];
