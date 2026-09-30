/** Why a report cannot be assembled (404 not a report, 409 chapters not written or not approved). */
export class AssemblyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
