/**
 * The errors of the COO's mode card (D3) and the brief it now carries (D3b):
 * objectives and sources. In their own file so the source-stage code and
 * research-mode.ts can both use them without importing each other.
 */

export class ModeLockedError extends Error {
  readonly code = "MODE_LOCKED";
  constructor(
    readonly reason: "APPROVED" | "GENERATION_STARTED",
    message?: string,
  ) {
    super(
      message ??
        (reason === "GENERATION_STARTED"
          ? "Chapters have been generated with this mode, so it can no longer change."
          : "The mode has been approved. Reopen it before changing it."),
    );
  }
}

export class ModeNotApprovedError extends Error {
  readonly code = "MODE_NOT_APPROVED";
  constructor(message = "The COO has not approved this project's research mode yet.") {
    super(message);
  }
}

/** A decision that breaks a rule; `problems` are shown on the card. */
export class ModeDecisionError extends Error {
  constructor(readonly problems: string[]) {
    super(problems[0] ?? "The decision is not valid.");
  }
}

/** A request the project's state does not allow (not a report, nothing to reopen…). */
export class ModeStateError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 = 409,
  ) {
    super(message);
  }
}
