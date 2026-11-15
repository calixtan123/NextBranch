/** Exercises deployment configuration and untrusted limiter results. */
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkRateLimit, type RateLimitAdapter } from "./rate-limit-server";

const request = new Request("https://api.nextbranch.app/api/departures", {
  headers: { "x-nextbranch-api-protection": "vercel-waf", "x-vercel-id": "spoofed" },
});
afterEach(() => vi.unstubAllEnvs());

describe("server request protection", () => {
  // Break: a production deployment reaches TfL without an acknowledged host rule.
  it.each([undefined, "", "allow-all", "VERCEL-WAF", "vercel-waf "])("refuses production configuration %s despite public headers", async value => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTBRANCH_API_PROTECTION", value);
    expect(await checkRateLimit(request)).toBeNull();
  });

  it.each(["vercel-waf", "netlify-edge"])("admits traffic for verified %s configuration", async value => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTBRANCH_API_PROTECTION", value);
    expect(await checkRateLimit(request)).toEqual({ allowed: true });
  });

  it.each(["development", "test"])("preserves %s usability without host configuration", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("NEXTBRANCH_API_PROTECTION", undefined);
    expect(await checkRateLimit(request)).toEqual({ allowed: true });
  });

  it("keeps injected provider denials and subsequent recovery in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTBRANCH_API_PROTECTION", undefined);
    let allowed = false;
    const adapter = () => ({ allowed });
    expect(await checkRateLimit(request, adapter)).toEqual({ allowed: false });
    allowed = true;
    expect(await checkRateLimit(request, adapter)).toEqual({ allowed: true });
  });

  // Break: malformed provider data is interpreted as permission or leaks an exception.
  it.each([null, undefined, {}, { allowed: "true" }, { allowed: 1 }])("refuses unavailable or malformed provider result %j", async result => {
    const adapter = (() => result) as unknown as RateLimitAdapter;
    expect(await checkRateLimit(request, adapter)).toBeNull();
  });

  it.each([false, true])("contains provider failure with asynchronous=%s", async asynchronous => {
    const adapter = asynchronous
      ? async () => { throw new Error("provider unavailable"); }
      : () => { throw new Error("provider unavailable"); };
    expect(await checkRateLimit(request, adapter)).toBeNull();
  });
});
