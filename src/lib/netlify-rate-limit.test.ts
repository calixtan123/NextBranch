/** Checks host declarations and URLPattern coverage without simulating counters. */
import { URLPattern } from "node:url";
import { describe, expect, it } from "vitest";
import departures, { config as departuresConfig } from "../../netlify/edge-functions/departures-rate-limit";
import journey, { config as journeyConfig } from "../../netlify/edge-functions/journey-rate-limit";

const rules = [
  { endpoint: "/api/departures", handler: departures, config: departuresConfig },
  { endpoint: "/api/journey", handler: journey, config: journeyConfig },
];

describe("Netlify Free live API rules", () => {
  it("uses at most two independent per-IP/domain rewrite rules", () => {
    expect(rules).toHaveLength(2);
    for (const { config } of rules) {
      expect(config.rateLimit).toEqual({
        action: "rewrite", to: "/api/rate-limited", windowLimit: 60,
        windowSize: 60, aggregateBy: ["ip", "domain"],
      });
    }
  });

  it.each(rules)("protects canonical and slash $endpoint while excluding fallback and other routes", ({ endpoint, config }) => {
    const matcher = new URLPattern({ pathname: config.path });
    for (const suffix of ["", "/", "?station=940GZZLUCTN", "/?station=940GZZLUCTN"]) {
      expect(matcher.test(`https://example.test${endpoint}${suffix}`)).toBe(true);
    }
    for (const path of ["/api/rate-limited", "/api/rate-limited/", `${endpoint}-other`, `${endpoint}/child`, "/", ...rules.filter(rule => rule.endpoint !== endpoint).map(rule => rule.endpoint)]) {
      expect(matcher.test(`https://example.test${path}`)).toBe(false);
    }
  });

  it.each(rules)("lets allowed $endpoint requests continue unchanged", ({ handler }) => {
    expect(handler()).toBeUndefined();
  });
});
