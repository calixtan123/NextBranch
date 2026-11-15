/** Validates server-owned protection configuration and contains limiter failures. */
import "server-only";

export type RateLimitDecision = { allowed: boolean };
export type RateLimitAdapter = (request: Request) => RateLimitDecision | Promise<RateLimitDecision>;

/** Requires an operator-verified host arrangement in production. */
function deploymentProtection(): RateLimitDecision | null {
  if (process.env.NODE_ENV !== "production") return { allowed: true };
  const protection = process.env.NEXTBRANCH_API_PROTECTION;
  if (protection === "vercel-waf" || protection === "netlify-edge") return { allowed: true };
  return null;
}

/**
 * Checks protection before upstream work and contains unavailable provider results.
 *
 * Production defaults acknowledge an externally enforced rule using server-only
 * configuration. The operator must verify that rule and every public entry point
 * before setting it. This check cannot inspect the host's actual enforcement.
 *
 * Parameters
 * ----------
 * request : Request
 *     Incoming request passed only to an explicitly injected server-side adapter.
 * adapter : RateLimitAdapter, optional
 *     Provider-owned protection, overriding the deployment configuration policy.
 *
 * Returns
 * -------
 * RateLimitDecision | null
 *     Allow/deny decision, or null when protection is missing or unavailable.
 *     Exceptions and malformed provider results fail closed to a controlled 503.
 */
export async function checkRateLimit(request: Request, adapter?: RateLimitAdapter): Promise<RateLimitDecision | null> {
  try {
    const decision = adapter ? await adapter(request) : deploymentProtection();
    if (!decision || typeof decision.allowed !== "boolean") return null;
    return { allowed: decision.allowed };
  } catch {
    // Provider errors must never allow upstream work or leak provider details.
    return null;
  }
}
