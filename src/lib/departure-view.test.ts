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

it("retains additive physical identity and line metadata while accepting legacy responses", async () => {
  const { catalogue } = await import("./catalogue");
  const { catalogueMetadata } = await import("./catalogue/capability");
  const metadata = catalogueMetadata(catalogue.stationsById.get("940GZZLUCND")!, "available");
  const response = {
    station: { id: "940GZZLUCND", name: "Colindale" }, observedAt,
    newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, catalogue: metadata,
    platforms: [{ platform: "1", direction: "Northbound", physicalPlatformId: "940GZZLUCND-Plat01-NB-northern", departures: [{
      id: "train", lineId: "northern", destinationName: null, expectedArrival: observedAt, secondsToStation: 0, towards: null,
    }] }],
  };
  const parsed = parseDeparturesResponse(response, "940GZZLUCND");
  expect(parsed?.catalogue).toEqual(metadata);
  expect(parsed?.platforms[0].physicalPlatformId).toBe("940GZZLUCND-Plat01-NB-northern");
  expect(parsed?.platforms[0].departures[0].lineId).toBe("northern");
});

it("preserves cardinal and line identity and isolates physical platforms sharing the same tuple", () => {
  const base = { id: "one", lineId: "central", platform: "1", direction: "Eastbound" as const, destinationName: null, expectedArrival: "2026-11-10T12:00:00Z", secondsToStation: 60, towards: null };
  const platforms = groupDepartures([
    { ...base, physicalPlatformId: "one" }, { ...base, id: "two", physicalPlatformId: "two", lineId: "district" },
    { ...base, id: "unverified", physicalPlatformId: null },
  ]);
  expect(platforms).toHaveLength(3);
  const response = parseDeparturesResponse({ station: { id: "s", name: "Station" }, observedAt: "2026-11-10T12:00:00Z", newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms }, "s");
  expect(response?.platforms.find(p => p.physicalPlatformId === "two")).toMatchObject({ direction: "Eastbound", departures: [{ lineId: "district" }] });
});
