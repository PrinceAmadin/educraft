/**
 * Icon architecture.
 *
 * ONE family — Lucide, sourced from `react-icons/lu`. Components import from
 * here and never from an icon package directly, so the family is swapped in
 * this file alone and nothing drifts.
 *
 * Every glyph renders at `currentColor` — colour is decided by the surrounding
 * type, not by the icon, which is why none of them sit in a coloured bubble.
 *
 * No emoji is ever used as an icon anywhere in the UI.
 *
 * Sizing scale (px), applied with Tailwind `size-*`:
 *   14–16  metadata beside mono labels
 *   18–20  controls and nav
 *   20–24  feature indicators
 *   larger only when the composition is art-directed around the glyph
 */
export {
  /* Services */
  LuGraduationCap as IconProject,
  LuFileText as IconReport,
  LuPresentation as IconSlides,
  LuBriefcaseBusiness as IconCareer,
  LuPenLine as IconEditing,
  LuLayers as IconBundle,

  /* Process */
  LuClipboardList as IconBrief,
  LuUsers as IconSpecialists,
  LuSearch as IconResearch,
  LuShieldCheck as IconQuality,
  LuPackageCheck as IconDelivery,

  /* Wayfinding + interface */
  LuArrowUpRight as IconArrow,
  LuArrowRight as IconArrowRight,
  LuArrowLeft as IconArrowLeft,
  LuChevronUp as IconChevronUp,
  LuChevronDown as IconChevronDown,
  LuChevronsUp as IconChevronsUp,
  LuChevronsDown as IconChevronsDown,
  LuSearch as IconSearch,
  LuMenu as IconMenu,
  LuX as IconClose,

  /* Command Center */
  LuFolderKanban as IconActiveProjects,
  LuTrendingUp as IconRevenue,
  LuWallet as IconPayouts,
  LuTriangleAlert as IconAtRisk,
  LuClock as IconDeadline,
  LuActivity as IconActivity,
  LuBellRing as IconActionRequired,
  LuUserPlus as IconAssign,
  LuClipboardCheck as IconQAQueue,
  LuBanknote as IconVerifyPayment,
  LuRotateCcw as IconRevision,
  LuRefreshCw as IconRefresh,
  LuCircleAlert as IconError,
  LuInbox as IconEmpty,
  LuMoveRight as IconTransition,
  LuTrendingDown as IconTrendDown,

  /* Assurance + editorial */
  LuCircleCheck as IconCheck,
  LuQuote as IconQuote,
  LuImage as IconImage,
} from "react-icons/lu";

/**
 * Every icon exported above is this type. Named `AppIcon` rather than carrying
 * a vendor name so call sites don't have to change if the family ever moves
 * again.
 */
export type { IconType as AppIcon } from "react-icons";
