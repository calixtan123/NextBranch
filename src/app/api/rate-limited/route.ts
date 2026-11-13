/** Returns the public retry response for requests denied at the Netlify boundary. */
import { NextResponse } from "next/server";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";

/**
 * Builds a fresh, non-cacheable response without upstream work.
 *
 * Returns
 * -------
 * NextResponse
 *     Shared JSON contract with HTTP 429 and the client's retry delay.
 */
export function GET(): NextResponse {
  return NextResponse.json(RATE_LIMIT_RESPONSE, {
    status: 429,
    headers: {
      "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    },
  });
}
