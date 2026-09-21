import { describe, expect, it } from "vitest";
import { isRateLimitResponse, RATE_LIMIT_RESPONSE } from "./rate-limit-contract";

describe("rate-limit public contract", () => {
  // Break: browser code imports a server adapter or accepts a malformed retry body
  // instead of using the exact public JSON contract shared by the API handlers.
  it("accepts only the documented browser-safe rate-limit response", () => {
    expect(isRateLimitResponse(RATE_LIMIT_RESPONSE)).toBe(true);
    expect(isRateLimitResponse({ error: "RATE_LIMITED", retryAfterSeconds: 29 })).toBe(false);
  });
});
