import { describe, expect, it } from "vitest";
import { parseJourneyResponse } from "./journey-view";
describe("journey response", () => {
  it("rejects malformed endpoint JSON before it reaches rendering", () => {
    expect(parseJourneyResponse({ trains: [{ id: 42 }] })).toBeNull();
  });
  it("requires the API-owned minutesSaved field", () => {
    const response = { journey: { from: "a", to: "b" }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null, trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null };
    expect(parseJourneyResponse(response)).toBeNull();
    expect(parseJourneyResponse({ ...response, minutesSaved: null })).not.toBeNull();
  });
  it("requires an exact requested journey at the browser boundary", () => {
    const response = { journey: { from: "a", to: "b" }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null, trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null };
    expect(parseJourneyResponse(response, { from: "a", to: "b" })).not.toBeNull();
    expect(parseJourneyResponse(response, { from: "a", to: "c" })).toBeNull();
  });
});
