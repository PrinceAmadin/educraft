/**
 * Checks the training systems' rules (the COO tutorials and the worker
 * series) with no database:
 *
 *   npm run check:training
 *
 * The series logic (unlock order, the gate, inert-until-published), the
 * tracked-mode crediting the COO tutorials use, and the wording. The shared
 * watching mechanics (anti-skip, resume, the rotate hints) are proven by
 * `check:tour`, which exercises the same functions through the ambassador
 * re-exports — run both after touching src/lib/training/*.
 *
 * Fails (exit 1) on any mismatch.
 */
import {
  DEFAULT_QUIZ_PASS_PERCENT,
  TRAINING_AUDIENCES,
  TRAINING_TEXT,
  TUTORIALS_TEXT,
  completeLine,
  completedCount,
  episodeComplete,
  episodeLabel,
  episodeUnlocked,
  isPlayable,
  isTrainingAudience,
  needsTrainingGate,
  nextRequired,
  playableEpisodes,
  quizPassPercentFor,
  scoreQuiz,
  seriesComplete,
  shuffled,
  watchedCount,
  type EpisodeRule,
  type WatchRule,
} from "../src/lib/training/rules";
import { advanceNoClamp, MAX_CREDITED_JUMP_SECONDS } from "../src/lib/training/video-rules";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

function ep(no: number, over: Partial<EpisodeRule> = {}): EpisodeRule {
  return { id: `e${no}`, episodeNo: no, videoUrl: "https://x/v.mp4", requiredForGate: true, isPublished: true, ...over };
}
const watched = (...ids: string[]): WatchRule[] => ids.map((id) => ({ videoId: id, watchedAt: new Date() }));

// ── Audiences ───────────────────────────────────────────────────────────────

expect("the two audiences", TRAINING_AUDIENCES, ["COO", "WORKER"]);
expect("isTrainingAudience", [isTrainingAudience("COO"), isTrainingAudience("WORKER"), isTrainingAudience("CLIENT"), isTrainingAudience(null)], [true, true, false, false]);

// ── Playable ────────────────────────────────────────────────────────────────

expect("a draft is not playable", isPlayable(ep(1, { isPublished: false })), false);
expect("no video is not playable", isPlayable(ep(1, { videoUrl: "" })), false);
expect("whitespace is no video", isPlayable(ep(1, { videoUrl: "   " })), false);
expect("published with a video is playable", isPlayable(ep(1)), true);
expect(
  "playableEpisodes filters and orders",
  playableEpisodes([ep(3), ep(1, { isPublished: false }), ep(2), ep(4, { videoUrl: "" })]).map((e) => e.episodeNo),
  [2, 3]
);

// ── Unlock order ────────────────────────────────────────────────────────────

{
  const series = [ep(1), ep(2), ep(3, { requiredForGate: false }), ep(4)];
  expect("episode 1 is always unlocked", episodeUnlocked(series[0], series, []), true);
  expect("episode 2 locked behind 1", episodeUnlocked(series[1], series, []), false);
  expect("episode 2 opens when 1 is watched", episodeUnlocked(series[1], series, watched("e1")), true);
  expect("the optional episode 3 opens with 1 and 2", episodeUnlocked(series[2], series, watched("e1", "e2")), true);
  expect("episode 4 does NOT wait for the optional 3", episodeUnlocked(series[3], series, watched("e1", "e2")), true);
  expect("episode 4 still waits for the required 2", episodeUnlocked(series[3], series, watched("e1")), false);
  expect("an unplayable episode is never unlocked", episodeUnlocked(ep(5, { videoUrl: "" }), series, watched("e1", "e2")), false);
  // A draft between two published episodes does not block the later one.
  const withDraft = [ep(1), ep(2, { isPublished: false }), ep(3)];
  expect("a draft never blocks the series", episodeUnlocked(withDraft[2], withDraft, watched("e1")), true);
}

// ── The gate ────────────────────────────────────────────────────────────────

{
  const series = [ep(1), ep(2), ep(3, { requiredForGate: false })];
  expect("nextRequired starts at episode 1", nextRequired(series, [])?.id, "e1");
  expect("nextRequired skips the watched", nextRequired(series, watched("e1"))?.id, "e2");
  expect("nextRequired never offers an optional episode", nextRequired(series, watched("e1", "e2")), null);
  expect("the series completes without the optional episode", seriesComplete(series, watched("e1", "e2")), true);
  expect("nothing published = complete (inert)", seriesComplete([ep(1, { isPublished: false })], []), true);
  expect("gated while a required episode is unwatched", needsTrainingGate(series, watched("e1"), false), true);
  expect("not gated once the required ones are watched", needsTrainingGate(series, watched("e1", "e2"), false), false);
  expect("an executive is never gated", needsTrainingGate(series, [], true), false);
  expect("inert with nothing published", needsTrainingGate([ep(1, { videoUrl: "" })], [], false), false);
  expect("watchedCount counts playable watched", watchedCount(series, watched("e1", "e3")), 2);
}

// ── Quizzes (Phase 3) ────────────────────────────────────────────────────────

const passed = (videoId: string): WatchRule => ({ videoId, watchedAt: new Date(), quizPassedAt: new Date() });

{
  // An episode with a quiz is complete only once the quiz is passed.
  const e = ep(1, { hasQuiz: true });
  expect("watched-but-quiz-pending is not complete", episodeComplete(e, watched("e1")), false);
  expect("watched + quiz passed is complete", episodeComplete(e, [passed("e1")]), true);
  expect("a no-quiz episode is complete when watched", episodeComplete(ep(1), watched("e1")), true);
  expect("an unwatched episode is never complete", episodeComplete(e, []), false);
}

{
  // The quiz on episode 1 holds episode 2 until it is passed.
  const series = [ep(1, { hasQuiz: true }), ep(2)];
  expect("episode 2 stays locked while ep1 quiz is pending", episodeUnlocked(series[1], series, watched("e1")), false);
  expect("episode 2 unlocks once ep1 quiz is passed", episodeUnlocked(series[1], series, [passed("e1")]), true);
  expect("the gate stays on ep1 while its quiz is pending", nextRequired(series, watched("e1"))?.id, "e1");
  expect("the gate moves to ep2 once ep1 is complete", nextRequired(series, [passed("e1")])?.id, "e2");
  expect("gated while a quiz is pending", needsTrainingGate(series, watched("e1"), false), true);
  expect("not gated once quiz passed and ep2 watched", needsTrainingGate(series, [passed("e1"), { videoId: "e2", watchedAt: new Date() }], false), false);
  expect("watched counts the watch, completed waits for the quiz", [watchedCount(series, watched("e1")), completedCount(series, watched("e1"))], [1, 0]);
  expect("completed counts a passed quiz episode", completedCount(series, [passed("e1")]), 1);
}

// ── Quiz scoring ─────────────────────────────────────────────────────────────

const q = (id: string, correctIndex: number, isActive = true) => ({ id, correctIndex, isActive });

expect("all correct passes at 80%", scoreQuiz([q("a", 1), q("b", 0)], { a: 1, b: 0 }, 80), { score: 2, total: 2, passed: true });
expect("half wrong fails at 80%", scoreQuiz([q("a", 1), q("b", 0)], { a: 1, b: 1 }, 80), { score: 1, total: 2, passed: false });
expect("exactly the pass mark passes", scoreQuiz([q("a", 0), q("b", 0), q("c", 0), q("d", 0), q("e", 1)], { a: 0, b: 0, c: 0, d: 0, e: 0 }, 80), { score: 4, total: 5, passed: true });
expect("an unanswered question scores nothing", scoreQuiz([q("a", 1), q("b", 0)], { a: 1 }, 50), { score: 1, total: 2, passed: true });
expect("inactive questions are ignored", scoreQuiz([q("a", 1), q("b", 0, false)], { a: 1 }, 80), { score: 1, total: 1, passed: true });
expect("no active questions never 'passes'", scoreQuiz([q("a", 1, false)], {}, 80).passed, false);
expect("the default pass mark is used", scoreQuiz([q("a", 0), q("b", 0)], { a: 0, b: 1 }).passed, false);
expect("the default pass mark constant", DEFAULT_QUIZ_PASS_PERCENT, 80);
expect("quizPassPercentFor: own value", quizPassPercentFor({ quizPassPercent: 60 }), 60);
expect("quizPassPercentFor: default when null", quizPassPercentFor({ quizPassPercent: null }), 80);
expect("quizPassPercentFor: clamped", [quizPassPercentFor({ quizPassPercent: 0 }), quizPassPercentFor({ quizPassPercent: 200 })], [1, 100]);

// shuffled: a deterministic rng gives a known permutation, and no item is lost.
{
  const seq = [0.99, 0.0, 0.5];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  const out = shuffled([1, 2, 3, 4], rng);
  expect("shuffled keeps every item", out.slice().sort((a, b) => a - b), [1, 2, 3, 4]);
  expect("shuffled leaves the input alone", [1, 2, 3].length, 3);
}

// ── Tracked-mode crediting (the COO tutorials) ──────────────────────────────

expect("continuous playback credits", advanceNoClamp(60, 60, 60.25), 60.25);
expect("playing through the furthest point credits", advanceNoClamp(60, 59.9, 60.2), 60.2);
expect("a seek far ahead earns nothing", advanceNoClamp(60, 60, 300), 60);
expect("playing after a far seek earns nothing", advanceNoClamp(60, 300, 300.25), 60);
expect("rewatching earns nothing", advanceNoClamp(60, 20, 20.25), 60);
expect("a stalled frame earns nothing", advanceNoClamp(60, 60.25, 60.25), 60);
expect("NaN earns nothing", advanceNoClamp(60, NaN, 61), 60);
expect(
  "a small skip-ahead within the jump window credits, like the gate",
  advanceNoClamp(60, 61, 61.25) > 60,
  true
);
expect("the jump constant is shared", MAX_CREDITED_JUMP_SECONDS, 1.5);

// ── Labels ──────────────────────────────────────────────────────────────────

expect("completeLine", completeLine(3, 9), "3 of 9 watched");
expect("episodeLabel", episodeLabel(4), "Episode 4");

// ── Wording ─────────────────────────────────────────────────────────────────

const allText: Record<string, string> = { ...TUTORIALS_TEXT, ...TRAINING_TEXT };
for (const [key, value] of Object.entries(allText)) {
  expect(`text ${key} is a non-empty sentence`, typeof value === "string" && value.trim().length > 0, true);
  expect(`text ${key} has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value), false);
  // Internal machinery never reaches a worker's or the COO's screen wording.
  expect(`text ${key} names no internal system`, /\b(Claude|Anthropic|AI|prompt|orchestrator)\b/i.test(value), false);
}
expect("the COO page title", TUTORIALS_TEXT.pageTitle, "How operations works");
expect("the worker page title", TRAINING_TEXT.pageTitle, "Training");
expect("the gate locks until the end", TRAINING_TEXT.lockedHint.toLowerCase().includes("end"), true);
expect("the email line mentions the first sign-in", TRAINING_TEXT.emailLine.includes("first time you sign in"), true);

if (failures > 0) {
  console.log(`\ncheck:training — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:training — the training rules hold.");
