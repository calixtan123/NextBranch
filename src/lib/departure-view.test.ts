import { describe, expect, it } from "vitest";
import { groupDepartures, parseDeparturesResponse } from "./departure-view";

const observedAt = "2026-09-16T12:00:00.000Z";

describe("departure view contract", () => {
  it("parses only a response for the requested station", () => {
    const response = {
      station: { id: "940GZZLUCTN", name: "Camden Town" },
      observedAt,
      newestPredictionGeneratedAt: null,
      refreshAfterSeconds: 30,
      platforms: [],
    };
    expect(parseDeparturesResponse(response, "940GZZLUCTN")?.station.name).toBe("Camden Town");
    expect(parseDeparturesResponse(response, "940GZZLUEGW")).toBeNull();
  });

  it("orders confirmed natural platform groups before unavailable groups and departures by time then id", () => {
    const grouped = groupDepartures([
      { id: "z", destinationName: "Morden via Bank", expectedArrival: "2026-09-16T12:03:00.000Z", secondsToStation: 180, platform: "10", direction: "Southbound", towards: "Morden via Bank" },
      { id: "b", destinationName: null, expectedArrival: "2026-09-16T12:01:00.000Z", secondsToStation: 60, platform: "2", direction: "Northbound", towards: null },
      { id: "a", destinationName: "Edgware", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToStation: 60, platform: "2", direction: "Northbound", towards: null },
      { id: "unknown", destinationName: null, expectedArrival: "2026-09-16T12:00:30.000Z", secondsToStation: 30, platform: null, direction: "Southbound", towards: null },
    ]);
    expect(grouped.map((group) => `${group.platform ?? "?"}:${group.direction ?? "?"}`)).toEqual([
      "2:Northbound", "10:Southbound", "?:Southbound",
    ]);
    expect(grouped[0]?.departures.map((departure) => departure.id)).toEqual(["a", "b"]);
  });
});
