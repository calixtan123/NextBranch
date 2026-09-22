import { describe, expect, it } from "vitest";
import { createDiagnostic } from "./diagnostics";

describe("TfL diagnostics", () => {
  // Break: a future caller sends a URL or credential in any string-bearing input
  // and the supposedly redacted diagnostic copies it into a server log record.
  it("normalizes every untrusted string input without retaining sensitive request details", () => {
    const secret = "https://api.tfl.gov.uk/Line/northern/Arrivals/940GZZLUCTN?app_key=secret-key";
    const diagnostic = createDiagnostic({
      operation: secret,
      durationMs: 123.9,
      error: {
        code: secret,
        upstreamStatus: "secret-status",
        message: secret,
        headers: { authorization: "Bearer secret-key" },
        payload: { location: "Camden Town" },
      },
      topologyFallbackUsed: false,
    });

    expect(diagnostic).toEqual({
      operation: "unknown",
      durationMs: 123,
      errorCategory: "unknown",
      upstreamStatus: null,
      topologyFallbackUsed: false,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret-key");
    expect(JSON.stringify(diagnostic)).not.toContain("Camden Town");
    expect(JSON.stringify(diagnostic)).not.toContain("secret-status");
  });
});
