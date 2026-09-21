/** Defines the small public rate-limit contract used by live API route handlers. */

export const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;
export const RATE_LIMIT_RESPONSE = {
  error: "RATE_LIMITED",
  retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
} as const;

export type RateLimitDecision = { allowed: boolean };
export type RateLimitAdapter = (request: Request) => RateLimitDecision | Promise<RateLimitDecision>;

/**
 * Allows every request when no distributed limiter is provided by the host.
 *
 * Production deployments must replace this adapter at their hosting or middleware
 * boundary with a distributed implementation; process memory cannot coordinate
 * limits across server instances.
 *
 * Parameters
 * ----------
 * _request : Request
 *     The incoming public request.

 * Returns
 * -------
 * RateLimitDecision
 *     An allow decision.
 */
export function allowAllRateLimit(_request: Request): RateLimitDecision {
  return { allowed: true };
}

/**
 * Identifies the documented JSON payload returned for a limited request.
 *
 * Parameters
 * ----------
 * value : unknown
 *     Untrusted response JSON received by the browser.

 * Returns
 * -------
 * boolean
 *     Whether the value is the exact rate-limit payload contract.
 */
export function isRateLimitResponse(value: unknown): value is typeof RATE_LIMIT_RESPONSE {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { error?: unknown; retryAfterSeconds?: unknown };
  return candidate.error === RATE_LIMIT_RESPONSE.error && candidate.retryAfterSeconds === RATE_LIMIT_RETRY_AFTER_SECONDS;
}
