/**
 * Shared between scripts/demo-seed.ts and scripts/demo-terminate.ts, so the
 * terminate script can find every row the seed made without importing (and
 * therefore running) the seed itself.
 */
export const DEMO = {
  projectCode: "EC-DEMO-01",
  clientCode: "ECC-DEMO-1",
  workerCode: "ECW-DEMO-1",
  cooEmail: "video.coo@educraft-demo.test",
  workerEmail: "video.specialist@educraft-demo.test",
  clientEmail: "demo.student@educraft-demo.test",
  /** The ambassador tour video (scripts/demo-seed-ambassador.ts). */
  ambassadorCode: "EC-A-DEMO1",
  ambassadorEmail: "video.ambassador@educraft-demo.test",
  /** Prefixes, so demo:terminate can find every row the ambassador seed made. */
  referralClientPrefix: "ECC-DEMOA-",
  referralProjectPrefix: "EC-DEMOA-",
  rivalPrefix: "EC-A-DEMOR",
  password: "EduCraft@Demo2026",
} as const;

/**
 * The demo scripts write a login whose password is in the source, and a project
 * that would otherwise land in real revenue and operations figures, so they run
 * only against a database on this machine.
 */
export function assertLocalDatabase(script: string): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]") return;
  console.error(
    [
      "",
      `  REFUSED — ${script} only runs against a database on this machine.`,
      `  DATABASE_URL host: ${host || "(unreadable)"}`,
      "",
      "  Stand up a throwaway local Postgres and point .env.demo at it.",
      "  See docs/demo-recording.md.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
