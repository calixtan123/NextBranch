/** Declares distributed Netlify protection for the public journey endpoint. */
import type { Config } from "@netlify/edge-functions";

/**
 * Continues allowed requests through the existing Netlify request chain.
 *
 * Returns
 * -------
 * undefined
 *     Netlify continues to the original Next handler. Denials use the host rewrite.
 */
export default function allowRequest(): undefined {
  return undefined;
}

export const config = {
  // One URLPattern covers the canonical path and its trailing-slash variant.
  path: "/api/journey{/}?",
  rateLimit: {
    action: "rewrite",
    to: "/api/rate-limited",
    // Provisional beta policy and shared-IP sizing are in TESTFLIGHT_RATE_LIMITS.md.
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} satisfies Config;
