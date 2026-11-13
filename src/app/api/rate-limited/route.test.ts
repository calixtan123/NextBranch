/** Checks the response emitted after Netlify rewrites a denied request. */
import { describe, expect, it } from "vitest";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";
import { GET } from "./route";

describe("rate-limited fallback", () => {
  it("returns the shared retry contract without caching the denial", async () => {
    const response = GET();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual(RATE_LIMIT_RESPONSE);
  });

  it("returns a fresh response for successive denied requests", async () => {
    const first = GET();
    const second = GET();
    expect(first).not.toBe(second);
    expect(await first.json()).toEqual(await second.json());
  });
});
