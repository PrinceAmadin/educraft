/**
 * Checks the deadline-pause rules with no database:
 *
 *   npm run check:pause
 *
 * One project can be paused three ways — waiting on the client, put on hold,
 * or waiting for data files — and all three stop the same clock. While it is
 * stopped the deadline moves with the pause, so a paused project is never
 * "overdue" for standing still, and every screen says so the same way.
 */
import {
  PAUSE_TEXT,
  clockPause,
  liveDeadline,
  pausedDaysBetween,
  pausedSoFar,
  shiftedDeadlines,
} from "../src/lib/pause-clock";
import { deadlineView, rowAccent } from "../src/lib/project-display";
import { deadlineInfo } from "../src/lib/utils";
import { deliveryCountdown } from "../src/lib/client-progress";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const DAY = 86_400_000;
const now = new Date("2026-11-25T12:00:00.000Z");
const days = (n: number) => new Date(now.getTime() + n * DAY);

// ── Is the clock stopped? ──────────────────────────────────────────────────────

expect("a running clock is not a pause", clockPause({ status: "IN_PROGRESS", deadlinePausedAt: null }, now), null);
expect("no field, no pause", clockPause({ status: "AWAITING_CLIENT_INPUT", deadlinePausedAt: null }, now), null);
expect("a working project with rubbish in the field is not paused", clockPause({ status: "IN_PROGRESS", deadlinePausedAt: "not a date" }, now), null);

// ── Held, but nothing says since when ──────────────────────────────────────────
// Projects held before the clock existed have no date. They are still stopped,
// and must never read as late — they just cannot claim any days.

for (const status of ["ON_HOLD", "DISPUTED"]) {
  const held = clockPause({ status, deadlinePausedAt: null }, now)!;
  expect(`${status} with no date is still a pause`, held !== null, true);
  expect(`${status} with no date claims no days`, held.days, 0);
  expect(`${status} with no date just says Paused`, held.label, "Paused");
  const v = deadlineView({ status, internalDeadline: days(-60), deadlinePausedAt: null }, now);
  expect(`${status} with no date is never overdue on screen`, Boolean(v.pause), true);
  expect(`${status} with no date leaves the date where it is`, v.deadline!.toISOString(), days(-60).toISOString());
}
expect("a rubbish date on a held project falls back the same way", clockPause({ status: "ON_HOLD", deadlinePausedAt: "not a date" }, now)!.days, 0);
expect("a working project is not rescued by the fallback", clockPause({ status: "IN_PROGRESS", deadlinePausedAt: null }, now), null);
expect("a cancelled project is not called paused", clockPause({ status: "CANCELLED", deadlinePausedAt: null }, now), null);
// A real date always wins over the fallback.
expect("a stamped hold counts its days", clockPause({ status: "ON_HOLD", deadlinePausedAt: days(-51) }, now)!.days, 51);

const waiting = clockPause({ status: "AWAITING_CLIENT_INPUT", deadlinePausedAt: days(-41) }, now)!;
expect("waiting on the client is a pause", waiting.reason, "CLIENT_INPUT");
expect("it counts the days", waiting.days, 41);
expect("and says so in plain words", waiting.label, "Paused · 41 days");
expect("with the reason under it", waiting.detail, PAUSE_TEXT.CLIENT_INPUT);

expect("a hold is a pause", clockPause({ status: "ON_HOLD", deadlinePausedAt: days(-2) }, now)!.reason, "HOLD");
expect("a dispute is a pause", clockPause({ status: "DISPUTED", deadlinePausedAt: days(-2) }, now)!.reason, "DISPUTE");
// A project still IN_PROGRESS with its clock stopped is waiting for data files.
expect("a data request is a pause", clockPause({ status: "IN_PROGRESS", deadlinePausedAt: days(-2) }, now)!.reason, "DATA");

expect("one day reads as one day", clockPause({ status: "ON_HOLD", deadlinePausedAt: days(-1) }, now)!.label, "Paused · 1 day");
expect("paused today says only Paused", clockPause({ status: "ON_HOLD", deadlinePausedAt: now }, now)!.label, "Paused");
expect("pausedSoFar matches", pausedSoFar(days(-9), now), 9);
expect("pausedSoFar with nothing paused is zero", pausedSoFar(null, now), 0);

// ── The deadline moves with the pause ──────────────────────────────────────────

const due = days(-41 + 7); // was due a week after the pause began

expect("a running clock leaves the date alone", liveDeadline(due, null, now)!.toISOString(), due.toISOString());
expect("a paused clock carries the date forward", liveDeadline(due, waiting, now)!.toISOString(), new Date(due.getTime() + 41 * DAY).toISOString());
expect("no deadline stays no deadline", liveDeadline(null, waiting, now), null);

// The whole point: EC-00002's case. Paused 41 days with 7 days still to run.
const paused = deadlineView({ status: "AWAITING_CLIENT_INPUT", internalDeadline: due, deadlinePausedAt: days(-41) }, now);
expect("a paused project is NOT overdue", paused.info.urgency === "overdue", false);
expect("it keeps the days it had left", paused.info.daysLeft, 7);
expect("and it is shown as paused", paused.pause!.days, 41);

const running = deadlineView({ status: "IN_PROGRESS", internalDeadline: due, deadlinePausedAt: null }, now);
expect("a running project that is late IS overdue", running.info.urgency, "overdue");
expect("overdue by the real number of days", running.info.daysLeft, -34);

// Pausing after the deadline has already passed does not rescue it, but it does
// stop the hole getting deeper.
const lateThenPaused = deadlineView({ status: "ON_HOLD", internalDeadline: days(-50), deadlinePausedAt: days(-10) }, now);
expect("a project paused while already late keeps the gap it had", lateThenPaused.info.daysLeft, -40);

// ── The pause and the resume agree ─────────────────────────────────────────────

const shift = shiftedDeadlines({ internalDeadline: due, expectedDeliveryAt: due }, pausedDaysBetween(days(-41), now));
expect(
  "the date shown while paused is exactly where the resume puts it",
  shift.internalDeadline!.toISOString(),
  liveDeadline(due, waiting, now)!.toISOString()
);
expect("a pause of no days moves nothing", shiftedDeadlines({ internalDeadline: due, expectedDeliveryAt: due }, 0), {});

// ── How a row reads ────────────────────────────────────────────────────────────

expect("a paused row is a wait, never a risk", rowAccent({ status: "ON_HOLD", internalDeadline: days(-50), deadlinePausedAt: days(-10) }), "waiting");
expect("a late running row is a risk", rowAccent({ status: "IN_PROGRESS", internalDeadline: days(-5), deadlinePausedAt: null }), "risk");
expect("a healthy row is fine", rowAccent({ status: "IN_PROGRESS", internalDeadline: days(30), deadlinePausedAt: null }), "ok");

// ── What the client is told ────────────────────────────────────────────────────

const clientPaused = deliveryCountdown({
  expectedDeliveryAt: due,
  deadlinePausedAt: days(-41),
  status: "AWAITING_CLIENT_INPUT",
  now,
});
expect("the client's date never shows a day already gone", clientPaused.date!.getTime() > now.getTime(), true);
expect("and it is labelled as paused", clientPaused.label.toLowerCase().includes("paused"), true);

const clientRunning = deliveryCountdown({ expectedDeliveryAt: days(5), deadlinePausedAt: null, status: "IN_PROGRESS", now });
expect("a running project still counts down", clientRunning.label, "5 days left");

// ── Wording ────────────────────────────────────────────────────────────────────

for (const [reason, text] of Object.entries(PAUSE_TEXT)) {
  expect(`${reason} has plain wording`, text.length > 5, true);
  expect(`${reason} has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), false);
  expect(`${reason} is not jargon`, /status|enum|null|AWAITING_/i.test(text), false);
}

// deadlineInfo itself is untouched: it still bands a plain date.
expect("deadlineInfo still bands a date", deadlineInfo(days(2), now).urgency, "urgent");

if (failures > 0) {
  console.log(`\ncheck:pause — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:pause — the deadline-pause rules hold.");
