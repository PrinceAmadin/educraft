import type { ResearchSummary } from "@/lib/services/research-summary";

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The hour in Nigeria (WAT), wherever the admin's browser thinks it is. */
export function nigeriaHour(now = new Date()): number {
  return (
    Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now)) % 24
  );
}

const papers = (n: number) => (n === 1 ? "1 paper" : `${n} papers`);
const are = (n: number) => (n === 1 ? "is" : "are");

/**
 * The message management copies to the client once research is done and
 * shared to their dashboard. Written to be accurate about what was actually
 * done: paywalled papers were reviewed by their details and abstracts, not
 * read in full, so it doesn't say otherwise. It links the client's dashboard
 * (Documents tab), never the Drive folder.
 */
export function buildClientResearchMessage(input: {
  clientFullName: string;
  projectCode: string;
  clientId: string;
  /** The client's Documents tab. */
  documentsUrl: string;
  summary: ResearchSummary;
  greeting: string;
}): string {
  const { summary: s, projectCode, greeting } = input;
  const firstWord = input.clientFullName.trim().split(/\s+/)[0] ?? "";
  // Names are often stored in capitals ("OYEWOLE"); a greeting shouldn't shout.
  const firstName = firstWord
    ? firstWord === firstWord.toUpperCase()
      ? firstWord[0] + firstWord.slice(1).toLowerCase()
      : firstWord
    : "there";
  const one = s.referenceOnly === 1;

  const lines: string[] = [
    `${greeting} ${firstName},`,
    "",
    `Your specialist has finished gathering research papers for your work. We've put together ${papers(s.total)} closely tied to your project topic:`,
    "",
    `• ${papers(s.core)} ${are(s.core)} core, the strong foundation for your project`,
    `• ${papers(s.closelyRelated)} ${are(s.closelyRelated)} closely related to your project`,
  ];

  if (s.withPdf > 0) {
    lines.push(`• ${papers(s.withPdf)} ${are(s.withPdf)} free and downloadable from your EduCraft dashboard.`);
  }
  if (s.referenceOnly > 0) {
    lines.push(
      `• ${papers(s.referenceOnly)} ${are(s.referenceOnly)} behind a paywall or couldn't be downloaded, so there's no PDF for ${one ? "it" : "them"}. We've reviewed ${one ? "its" : "their"} details and abstracts, and ${one ? "it's" : "they're"} part of your reference list. Your university library can give you access to the full text.`
    );
  }

  lines.push(
    "",
    `Everything is in the Documents tab of your dashboard, with the full reference list as a Word file to show your supervisor:`,
    input.documentsUrl,
    `Sign in with your Client ID ${input.clientId}.`,
    "",
    `I'll keep you posted on your project (${projectCode}) and share feedback regularly.`
  );
  return lines.join("\n");
}
