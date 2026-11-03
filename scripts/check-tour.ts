/**
 * The ambassador tutorial rules, no database and no browser:
 *   - "watched" is 95% and nothing else;
 *   - progress is the furthest point actually played, so dragging the scrubber,
 *     setting currentTime from the console and re-watching the opening all earn
 *     nothing (the property the whole gate rests on);
 *   - who is held at the gate, as a truth table;
 *   - resume never lands on the last second;
 *   - the chapter list is ordered and inside the video;
 *   - the wording an ambassador reads is present, plain and free of the words
 *     the portal bans.
 *
 *   npm run check:tour
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  MAX_CREDITED_JUMP_SECONDS,
  PROGRESS_SAVE_SECONDS,
  ROTATE_HINT_VISIBLE_SECONDS,
  TOUR_CHAPTERS,
  TOUR_CONTROLS,
  TOUR_TEXT,
  TOUR_VERSION,
  WATCHED_FRACTION,
  advanceProgress,
  creditedDelta,
  formatTimestamp,
  needsTour,
  resumeAt,
  rotateHintTimes,
  rotateHintVisible,
  roughLength,
  tourComplete,
  watchedPercent,
} from "../src/lib/ambassador-tour";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// ── The settings the rest depends on ──
expect("watched means 95%", WATCHED_FRACTION, 0.95);
expect("progress is saved every 10 s", PROGRESS_SAVE_SECONDS, 10);
expect("a credited step is at most 1.5 s", MAX_CREDITED_JUMP_SECONDS, 1.5);
expect("the version is a non-empty string", TOUR_VERSION.length > 0, true);

// ── tourComplete ──
const LEN = 370; // 6:10, the script's target
expect("95% of the video is enough", tourComplete(LEN * 0.95, LEN), true);
expect("exactly 95% is enough", tourComplete(351.5, LEN), true);
expect("94% is not enough", tourComplete(LEN * 0.94, LEN), false);
expect("the whole video is enough", tourComplete(LEN, LEN), true);
expect("more than the video is enough", tourComplete(LEN + 50, LEN), true);
expect("nothing watched is never enough", tourComplete(0, LEN), false);
expect("an unknown length is never enough", tourComplete(LEN, 0), false);
expect("a negative length is never enough", tourComplete(LEN, -10), false);
expect("NaN seconds is never enough", tourComplete(Number.NaN, LEN), false);
expect("NaN length is never enough", tourComplete(LEN, Number.NaN), false);
expect("Infinity length is never enough (a live stream)", tourComplete(LEN, Number.POSITIVE_INFINITY), false);

// ── creditedDelta: only small forward steps ──
expect("a normal quarter-second step counts", creditedDelta(10, 10.25), 0.25);
expect("a 1.5 s step counts (the boundary)", creditedDelta(10, 11.5), 1.5);
expect("a 1.6 s step counts for nothing", creditedDelta(10, 11.6), 0);
expect("a drag to the end counts for nothing", creditedDelta(10, 360), 0);
expect("rewinding counts for nothing", creditedDelta(100, 40), 0);
expect("standing still counts for nothing", creditedDelta(10, 10), 0);
expect("NaN counts for nothing", creditedDelta(Number.NaN, 10), 0);

// ── advanceProgress: the anti-skip rule the player runs ──
expect("playing on from the furthest point advances it", advanceProgress(10, 10, 10.5), { progress: 10.5, clampTo: null });
expect("a drag far ahead earns nothing and is pulled back", advanceProgress(10, 10, 300), { progress: 10, clampTo: 10 });
expect("currentTime set to the end from the console is pulled back", advanceProgress(10, 10, LEN - 1), { progress: 10, clampTo: 10 });
expect("re-watching an earlier stretch earns nothing", advanceProgress(200, 50, 50.5), { progress: 200, clampTo: null });
expect("rewinding is allowed, it just earns nothing", advanceProgress(200, 200, 50), { progress: 200, clampTo: null });
expect("a 1.5 s step from behind the furthest point still advances it", advanceProgress(10, 9.8, 11.3), { progress: 11.3, clampTo: null });
// Between "too big to credit" and "far enough to be a seek" nothing happens:
// the stall recovered, so no time is earned, but playback is left alone.
expect("a stutter earns nothing and is not pulled back", advanceProgress(10, 9.8, 11.4), { progress: 10, clampTo: null });

/** Plays the video the way a browser would, and returns the progress earned. */
function play(moves: [from: number, to: number][], start = 0): number {
  let progress = start;
  let previous = start;
  for (const [, to] of moves) {
    const next = advanceProgress(progress, previous, to);
    if (next.clampTo != null) {
      previous = next.clampTo;
      continue;
    }
    previous = to;
    progress = next.progress;
  }
  return progress;
}

/** A tick every quarter-second from `from` to `to`. */
function ticks(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from + 0.25; t <= to + 1e-9; t += 0.25) out.push([t - 0.25, Number(t.toFixed(2))]);
  return out;
}

// Watched properly: 370 s of playback earns 370 s.
const straight = play(ticks(0, LEN));
expect("playing the whole video through earns all of it", Math.round(straight), LEN);
expect("and that passes", tourComplete(straight, LEN), true);

// Dragged to the end: earns the 20 s actually watched, and is refused.
const dragged = play([...ticks(0, 20), [20, LEN - 2]]);
expect("watching 20 s then dragging to the end earns only the 20 s", Math.round(dragged), 20);
expect("and that is refused", tourComplete(dragged, LEN), false);

// Re-watching the opening minute twenty times: still a minute in.
const looped: [number, number][] = [];
for (let i = 0; i < 20; i++) looped.push(...ticks(0, 60), [60, 0]);
expect("re-watching the first minute twenty times earns one minute", Math.round(play(looped)), 60);
expect("and that is refused", tourComplete(play(looped), LEN), false);

// Resuming: a second sitting carries on from the stored position.
const resumed = play(ticks(200, LEN), 200);
expect("resuming at 200 s and playing on earns the whole video", Math.round(resumed), LEN);
expect("and that passes", tourComplete(resumed, LEN), true);

// ── watchedPercent ──
expect("half way is 50%", watchedPercent(LEN / 2, LEN), 50);
expect("over the end is capped at 100%", watchedPercent(LEN + 100, LEN), 100);
expect("an unknown length reads 0, never NaN", watchedPercent(100, 0), 0);
expect("negative seconds read 0", watchedPercent(-5, LEN), 0);

// ── resumeAt ──
expect("resume lands where they stopped", resumeAt(120, LEN), 120);
expect("resume never lands on the last second", resumeAt(LEN, LEN), LEN - 1);
expect("resume past the end comes back inside", resumeAt(LEN + 90, LEN), LEN - 1);
expect("resume from nothing is the start", resumeAt(0, LEN), 0);
expect("resume with no known length is what was stored", resumeAt(120, null), 120);

// ── needsTour: who is held at the gate ──
const fresh = { tourVersion: null };
const done = { tourVersion: TOUR_VERSION };
const oldCut = { tourVersion: "0" };
expect("no video configured: nobody is ever held", needsTour(fresh, false, false), false);
expect("no video, not even an old watcher", needsTour(oldCut, false, false), false);
expect("a new ambassador with a video is held", needsTour(fresh, true, false), true);
expect("an ambassador who finished this version is not", needsTour(done, true, false), false);
expect("an ambassador who finished an older cut is held again", needsTour(oldCut, true, false), true);
expect("an executive is never held", needsTour(fresh, true, true), false);
expect("an executive is never held, even on an old cut", needsTour(oldCut, true, true), false);

// ── formatTimestamp / roughLength ──
expect("0 reads 0:00", formatTimestamp(0), "0:00");
expect("95 s reads 1:35", formatTimestamp(95), "1:35");
expect("370 s reads 6:10", formatTimestamp(370), "6:10");
expect("724 s reads 12:04", formatTimestamp(724), "12:04");
expect("a fraction rounds down", formatTimestamp(95.9), "1:35");
expect("a negative reads 0:00", formatTimestamp(-5), "0:00");
expect("NaN reads 0:00", formatTimestamp(Number.NaN), "0:00");
expect("370 s is about 6 minutes", roughLength(370), "about 6 minutes");
expect("50 s is about a minute", roughLength(50), "about a minute");
expect("an unknown length says nothing", roughLength(null), null);
expect("a zero length says nothing", roughLength(0), null);

// ── The chapter list (empty until the final cut is rendered) ──
const titles = TOUR_CHAPTERS.map((c) => c.title);
expect("every chapter has a title", titles.every((t) => t.trim().length > 0), true);
expect("no chapter title is repeated", new Set(titles).size, titles.length);
expect("no chapter starts before the video", TOUR_CHAPTERS.every((c) => c.startSeconds >= 0), true);
expect(
  "the chapters are in order",
  TOUR_CHAPTERS.every((c, i) => i === 0 || c.startSeconds > TOUR_CHAPTERS[i - 1].startSeconds),
  true
);
expect(
  "no chapter starts after a 7-minute video (the brief's ceiling)",
  TOUR_CHAPTERS.every((c) => c.startSeconds < 7 * 60),
  true
);
if (TOUR_CHAPTERS.length > 0) {
  expect("the first chapter starts at the beginning", TOUR_CHAPTERS[0].startSeconds, 0);
}

// ── The wording ──
const sentences = Object.entries({ ...TOUR_TEXT, ...TOUR_CONTROLS });
expect("every sentence is filled in", sentences.every(([, v]) => v.trim().length > 0), true);
expect(
  "nothing uses an emoji as an icon",
  sentences.filter(([, v]) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(v)).map(([k]) => k),
  []
);
// The portal's own house rule: ambassadors are students, not marketers, and
// internal automation is never named to anyone outside HQ.
const BANNED = /\b(conversion|conversions|converted|QA|specialist|worker|AI)\b/i;
expect(
  "no banned portal word reaches an ambassador",
  sentences.filter(([, v]) => BANNED.test(v)).map(([k]) => k),
  []
);
expect(
  "no sentence SHOUTS",
  sentences.filter(([, v]) => /\b[A-Z]{4,}\b/.test(v)).map(([k]) => k),
  []
);
expect("the gate says what unlocks it", /watch/i.test(TOUR_TEXT.lockedHint), true);
expect("the section is named as the founder asked", TOUR_TEXT.sectionTitle, "How the ambassador platform works");
expect("the email line promises the tour at first sign-in", /sign in/i.test(TOUR_TEXT.emailLine), true);

// ── The "turn your phone sideways" hint ─────────────────────────────────────
// The real cut runs 6:59. A 16:9 tutorial in an upright phone column is small,
// so the hint shows three times: after they press play, and a third and two
// thirds of the way in.
const REAL = 418.97;
expect("each hint stays up for 6 s", ROTATE_HINT_VISIBLE_SECONDS, 6);
expect("the real 6:59 cut gets three hints", rotateHintTimes(REAL), [4, 140, 279]);
expect("the first comes just after play", rotateHintTimes(REAL)[0], 4);
expect("a one-minute video gets two", rotateHintTimes(60), [4, 20]);
expect("a 20-second clip gets one", rotateHintTimes(20), [4]);
expect("a clip too short to finish a hint gets none", rotateHintTimes(8), []);
expect("an unknown length gets none", rotateHintTimes(0), []);
expect("NaN gets none", rotateHintTimes(Number.NaN), []);
expect(
  "no hint can be cut off by the end of the video",
  rotateHintTimes(REAL).every((t) => t + ROTATE_HINT_VISIBLE_SECONDS <= REAL),
  true
);

const hints = rotateHintTimes(REAL);
expect("nothing on screen before the first hint", rotateHintVisible(3.9, hints), false);
expect("on screen the moment it is due", rotateHintVisible(4, hints), true);
expect("still on screen just before it expires", rotateHintVisible(9.9, hints), true);
expect("gone once it has had its 6 s", rotateHintVisible(10, hints), false);
expect("on screen again a third of the way in", rotateHintVisible(141, hints), true);
expect("and two thirds of the way in", rotateHintVisible(280, hints), true);
expect("nothing in between", rotateHintVisible(90, hints), false);
expect("nothing at the close", rotateHintVisible(415, hints), false);
expect("no hint when the length is unknown", rotateHintVisible(100, rotateHintTimes(0)), false);
expect("rewinding shows it again (no bookkeeping to go stale)", rotateHintVisible(5, hints), true);

// ── A NULL tourVersion must be matched explicitly ───────────────────────────
// `NOT (tourVersion = '1')` is NULL in SQL for a row that has never been
// stamped, so a bare Prisma `NOT` / `not` filter skips exactly the people the
// gate exists for: every brand-new ambassador. It was written that way once and
// the gate could not be passed at all. Both files must go through
// `NOT_THIS_VERSION`, which spells the null branch out.
const GATE_QUERY_FILES = ["src/lib/services/ambassador-tour.ts", "scripts/ambassador-tour-backfill.ts"];
for (const file of GATE_QUERY_FILES) {
  const source = readFileSync(resolve(__dirname, "..", file), "utf8");
  expect(`${file} has no bare NOT on tourVersion`, /NOT:\s*\{\s*tourVersion/.test(source), false);
  expect(`${file} goes through NOT_THIS_VERSION`, source.includes("NOT_THIS_VERSION"), true);
}
expect(
  "NOT_THIS_VERSION spells out the null branch",
  /tourVersion:\s*null/.test(readFileSync(resolve(__dirname, "..", GATE_QUERY_FILES[0]), "utf8")),
  true
);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`check:tour — the tutorial rules hold (${TOUR_CHAPTERS.length} chapter(s) listed).`);
