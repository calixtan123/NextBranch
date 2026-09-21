/** Defines the server-only adapter boundary for provider-owned rate limiting. */
import "server-only";

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
