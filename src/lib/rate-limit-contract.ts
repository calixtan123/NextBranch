/** Defines the browser-safe public JSON contract for rate-limited API responses. */

export const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;
export const RATE_LIMIT_RESPONSE = {
  error: "RATE_LIMITED",
  retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
} as const;

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
