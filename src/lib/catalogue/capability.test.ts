/** Verify conservative mapping decisions independently of live snapshot state. */
import { describe, expect, it } from "vitest";
import { catalogue } from "./index";
import { catalogueMetadata, northernStopAreas, physicalPlatformForTrain, serviceCapability } from "./capability";
import { normalizePredictions } from "../northern/predictions";

const colindale = catalogue.stationsById.get("940GZZLUCND")!;
const now = new Date("2026-11-10T12:00:00Z");

describe("catalogue capability", () => {
  it("requires a unique physical number/cardinal mapping and leaves ambiguity unverified", () => {
    const platform = colindale.platforms[0];
    const service = platform.services[0];
    expect(serviceCapability(colindale, platform, service)).toMatchObject({ feed: "supported", mapping: "supported" });
    const ambiguous = { ...colindale, platforms: [platform, { ...platform, platform_id: "different-physical-platform" }] };
    expect(serviceCapability(ambiguous, platform, service)).toMatchObject({ feed: "supported", mapping: "unverified" });
    expect(serviceCapability(colindale, { ...platform, platform_number: "" }, service).mapping).toBe("unverified");
    expect(serviceCapability(colindale, platform, { ...service, stop_area_naptan_code: "" }).feed).toBe("unverified");
  });

  it("does not assign a platform from destination, historical ID text or a number alone", () => {
    for (const platformName of [undefined, "Platform 1", "940GZZLUCND-Plat01-NB-northern", "Southbound - Platform 1"]) {
      const train = normalizePredictions([{
        id: "train", lineId: "northern", naptanId: "940GZZLUCND",
        expectedArrival: "2026-11-10T12:01:00Z", destinationName: "Edgware", platformName,
      }], now)[0]!;
      expect(physicalPlatformForTrain(colindale, train)).toBeNull();
      expect(train.branch).toBeNull();
    }
  });

  it("lists one distinct Northern stop area and separates unsupported shared NR service", () => {
    const euston = catalogue.stationsById.get("HUBEUS")!;
    expect(northernStopAreas(euston)).toEqual(["940GZZLUEUS"]);
    const amersham = catalogue.stations.find(station => station.station_name === "Amersham")!;
    const metadata = catalogueMetadata(amersham, "unverified");
    expect(metadata.platforms[0].services.find(s => s.lineId === "national-rail")?.capability).toMatchObject({ feed: "unsupported", mapping: "unsupported" });
    expect(metadata.platforms[0].services.find(s => s.lineId === "metropolitan")?.capability.feed).toBe("supported");
    expect(northernStopAreas(amersham)).toEqual([]);
  });
});

it("supports all eleven official Underground feeds and only observed unique platform mappings", async () => {
  const { undergroundFeeds } = await import("./capability");
  const { undergroundLines } = await import("../underground/platform");
  for (const line of undergroundLines) {
    const match = catalogue.stations.flatMap(station => station.platforms.flatMap(platform => platform.services.filter(service => service.line_id === line && serviceCapability(station, platform, service).mapping === "supported").map(service => ({ station, platform, service }))));
    expect(match.length, line).toBeGreaterThan(0);
    expect(undergroundFeeds(match[0]!.station)).toContainEqual({ lineId: line, stopAreaId: match[0]!.service.stop_area_naptan_code });
  }
  const kew = catalogue.stationsById.get("HUBKWG")!;
  expect(undergroundFeeds(kew)).toEqual([{ lineId: "district", stopAreaId: "940GZZLUKWG" }]);
  expect(serviceCapability(kew, kew.platforms[0]!, kew.platforms[0]!.services.find(s => s.line_id === "mildmay")!)).toMatchObject({ feed: "unverified", mapping: "unverified" });
});

it("requires matching line and service stop area before assigning a same-number physical platform", () => {
  const euston = catalogue.stationsById.get("HUBEUS")!;
  const train = { ...normalizePredictions([{ id: "t", lineId: "northern", naptanId: "940GZZLUEUS", expectedArrival: "2026-11-10T12:01:00Z", platformName: "Northbound - Platform 3" }], now)[0]!, stopAreaId: "different-stop" };
  expect(physicalPlatformForTrain(euston, train)).toBeNull();
});
