import { describe, expect, it } from "vitest";
import { createDiagnostic } from "./diagnostics";

describe("TfL diagnostics", () => {
  // Break: server logs include a credential-bearing URL, raw location, or payload
  // when recording an upstream failure instead of a small structured summary.
  it("normalizes upstream failures without retaining sensitive request details", () => {
    const secret = "https://api.tfl.gov.uk/Line/northern/Arrivals/940GZZLUCTN?app_key=secret-key";
    const diagnostic = createDiagnostic({
      operation: "arrivals",
      durationMs: 123.9,
      error: { code: "upstream", upstreamStatus: 503, message: secret, payload: { location: "Camden Town" } },
      topologyFallbackUsed: false,
    });

    expect(diagnostic).toEqual({
      operation: "arrivals",
      durationMs: 123,
      errorCategory: "upstream",
      upstreamStatus: 503,
      topologyFallbackUsed: false,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret-key");
    expect(JSON.stringify(diagnostic)).not.toContain("Camden Town");
  });
});
