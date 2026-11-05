/**
 * Checks the Stage-3 final-practical rules with no database:
 *
 *   npm run check:final
 *
 * The chapter voice scan (empty, clean, and AI-sounding text), the brief
 * defaults and setting keys, and the candidate wording.
 */
import {
  FINAL_DEFAULTS,
  FINAL_SETTING_KEYS,
  FINAL_TEXT,
  scanChapterVoice,
} from "../src/lib/screening/final-practical";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// ── The chapter voice scan ─────────────────────────────────────────────────────

expect("empty text is flagged empty, nothing found", (() => { const v = scanChapterVoice(""); return [v.empty, v.total, v.majorCount]; })(), [true, 0, 0]);
expect("whitespace-only text is empty", scanChapterVoice("   \n  ").empty, true);

{
  const clean =
    "The organisation uses modern software to manage its academic projects. The tools were chosen after comparing three options on cost and reliability across the 2024 session. Each option was scored against the same checklist so the comparison was fair.";
  const v = scanChapterVoice(clean);
  expect("a clean sample has no tells", [v.empty, v.majorCount], [false, 0]);
}

{
  const aiish =
    "It is important to note that our organisation leverages cutting-edge, groundbreaking solutions. In today's rapidly evolving digital landscape, we believe these tools are essential. Furthermore, the implementation of robust frameworks empowers every stakeholder.";
  const v = scanChapterVoice(aiish);
  expect("an AI-sounding sample is flagged", v.majorCount >= 3, true);
  expect("every finding carries a label and a fix", v.findings.every((f) => f.label.length > 0 && f.fix.length > 0), true);
}

// ── Defaults + setting keys ────────────────────────────────────────────────────

expect("the four brief keys + minutes", Object.keys(FINAL_SETTING_KEYS).sort(), ["memoBrief", "minutes", "promptBrief", "writingBrief1", "writingBrief2"]);
expect("minutes default is sane", FINAL_DEFAULTS.minutes >= 30 && FINAL_DEFAULTS.minutes <= 240, true);
expect("every default brief is a non-empty string", [FINAL_DEFAULTS.writingBrief1, FINAL_DEFAULTS.writingBrief2, FINAL_DEFAULTS.memoBrief, FINAL_DEFAULTS.promptBrief].every((s) => typeof s === "string" && s.trim().length > 20), true);

// ── Wording ────────────────────────────────────────────────────────────────────

const text = [
  FINAL_TEXT.introTitle,
  FINAL_TEXT.introBody,
  FINAL_TEXT.startLabel,
  FINAL_TEXT.writing1Title,
  FINAL_TEXT.writing2Title,
  FINAL_TEXT.writingUploadLabel,
  FINAL_TEXT.memoTitle,
  FINAL_TEXT.promptTitle,
  FINAL_TEXT.submitLabel,
  FINAL_TEXT.doneTitle,
  FINAL_TEXT.doneBody,
  FINAL_TEXT.emailSubject,
  FINAL_TEXT.emailLine,
  FINAL_TEXT.timeNote(120),
];
for (const [i, v] of text.entries()) {
  expect(`wording ${i} is a non-empty sentence`, typeof v === "string" && v.trim().length > 0, true);
  expect(`wording ${i} has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(v), false);
}
expect("the time note carries the minutes", FINAL_TEXT.timeNote(120).includes("120 minutes"), true);

if (failures > 0) {
  console.log(`\ncheck:final — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:final — the final-practical rules hold.");
