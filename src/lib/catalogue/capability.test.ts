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
    expect(metadata.platforms[0].services.find(s => s.lineId === "metropolitan")?.capability.feed).toBe("unverified");
    expect(northernStopAreas(amersham)).toEqual([]);
  });
});
