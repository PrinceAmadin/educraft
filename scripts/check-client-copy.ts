/**
 * Fails when client-facing code mentions internal words. Clients must never
 * read about AI or automation, QA revisions, workers or internal notes: they
 * see "specialist", "quality check" and their own updates.
 *
 *   npm run check:client-copy
 *
 * Scans the client pages, client components and the modules that write client
 * wording (progress steps, feed text, client emails). Comments and import
 * lines are ignored; identifiers like `workerId` do not match (whole words only).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "src/app/(dashboard)/client",
  "src/app/(auth)/client",
  "src/components/client",
  "src/lib/client-progress.ts",
  "src/lib/client-updates.ts",
  "src/lib/emails/client-update.ts",
  "src/lib/receipts.ts",
];

// Whole words. "AI" is matched case-sensitively so "said" or "again" never trip it.
const BANNED: { label: string; re: RegExp }[] = [
  { label: "AI", re: /\bAI\b/ },
  { label: "Claude/Anthropic", re: /\b(claude|anthropic)\b/i },
  { label: "automation", re: /\b(automation|automated|automatically generated)\b/i },
  { label: "QA", re: /\bQA\b/ },
  { label: "revision", re: /\brevisions?\b/i },
  { label: "worker", re: /\bworkers?\b/i },
  { label: "internal", re: /\binternal\b/i },
];

function files(path: string): string[] {
  const full = join(ROOT, path);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return /\.(ts|tsx)$/.test(full) ? [full] : [];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

function stripComments(source: string): string {
  // Block comments, then line comments (not inside URLs like https://).
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

let problems = 0;
for (const file of TARGETS.flatMap(files)) {
  const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
  lines.forEach((line, i) => {
    if (/^\s*import\b/.test(line)) return;
    for (const word of BANNED) {
      if (word.re.test(line)) {
        problems++;
        console.log(`${relative(ROOT, file)}:${i + 1}  "${word.label}"  ${line.trim().slice(0, 120)}`);
      }
    }
  });
}

if (problems) {
  console.error(`\n${problems} client-facing mention(s) of internal words. Reword them for the client.`);
  process.exit(1);
}
console.log("Client-facing copy is clean.");
