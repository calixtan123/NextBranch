import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDeparturesHandler } from "./route";
import { arrivalSchema } from "@/lib/northern/schemas";
import { TflError } from "@/lib/tfl/client";

const now = new Date("2026-09-16T12:00:00.000Z");
const station = "940GZZLUCTN";
const request = (query: string) => new Request(`http://local/api/departures${query}`);
const arrival = (value: Record<string, unknown> = {}) => arrivalSchema.parse({
  id: "one", vehicleId: "v1", naptanId: station, lineId: "northern",
  destinationName: "Morden via Bank", expectedArrival: "2026-09-16T12:02:00.000Z",
  timestamp: "2026-09-16T11:59:00.000Z", platformName: "Southbound - Platform 10",
  direction: "inbound", towards: "Morden via Bank", ...value,
});

describe("departures API", () => {
  it("rejects missing, unknown, duplicate, and extra station query parameters before TfL", async () => {
    const arrivals = vi.fn();
    const get = createDeparturesHandler({ arrivals, now: () => now });
    for (const query of ["", "?station=unknown", `?station=${station}&extra=x`, `?station=${station}&station=${station}`]) {
      const result = await get(request(query));
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: "INVALID_STATION" });
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(arrivals).not.toHaveBeenCalled();
  });

  // Break: a hosting-level limiter denies a request but the public boundary still
  // calls TfL or returns a generic error instead of the documented retry contract.
  it("returns the public rate-limit contract before validating or fetching departures", async () => {
    const arrivals = vi.fn();
    const get = createDeparturesHandler({
      arrivals,
      now: () => now,
      rateLimit: async () => ({ allowed: false }),
    });

    const result = await get(request(`?station=${station}`));
    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBe("30");
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ error: "RATE_LIMITED", retryAfterSeconds: 30 });
    expect(arrivals).not.toHaveBeenCalled();
  });

  it("returns every current station-bound Northern prediction in natural platform order", async () => {
    const get = createDeparturesHandler({
      now: () => now,
      arrivals: async () => [
        arrival({ id: "ten", platformName: "Southbound - Platform 10" }),
        arrival({ id: "two-later", platformName: "Northbound - Platform 2", expectedArrival: "2026-09-16T12:04:00.000Z" }),
        arrival({ id: "two-first", platformName: "Northbound - Platform 2", expectedArrival: "2026-09-16T12:01:00.000Z" }),
        arrival({ id: "unavailable", platformName: undefined, direction: "outbound" }),
        arrival({ id: "wrong-line", lineId: "victoria" }),
        arrival({ id: "wrong-station", naptanId: "940GZZLUEGW" }),
      ],
    });
    const result = await get(request(`?station=${station}`));
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toMatchObject({
      station: { id: station, name: "Camden Town" },
      observedAt: now.toISOString(),
      newestPredictionGeneratedAt: "2026-09-16T11:59:00.000Z",
      refreshAfterSeconds: 30,
      platforms: [
        { platform: "2", direction: "Northbound", departures: [{ id: "two-first" }, { id: "two-later" }] },
        { platform: "10", direction: "Southbound", departures: [{ id: "ten" }] },
        { platform: null, direction: "Northbound", departures: [{ id: "unavailable" }] },
      ],
    });
  });

  it("maps TfL configuration and malformed-arrivals upstream failures to explicit no-store responses", async () => {
    const configuration = createDeparturesHandler({ now: () => now, arrivals: async () => { throw new TflError("config", "missing"); } });
    const upstream = createDeparturesHandler({ now: () => now, arrivals: async () => { throw new TflError("upstream", "TfL arrivals payload invalid"); } });
    expect(await (await configuration(request(`?station=${station}`))).json()).toMatchObject({ error: "CONFIGURATION_ERROR" });
    expect((await configuration(request(`?station=${station}`))).status).toBe(500);
    expect((await upstream(request(`?station=${station}`))).status).toBe(503);
    expect(await (await upstream(request(`?station=${station}`))).json()).toMatchObject({ error: "TFL_UNAVAILABLE" });
  });
});

it("resolves a Northern hub ID to the service stop area while preserving requested identity", async () => {
  const arrivals = vi.fn(async () => []);
  const get = createDeparturesHandler({ arrivals, now: () => now });
  const result = await get(request("?station=HUBEUS"));
  expect(result.status).toBe(200);
  expect(arrivals).toHaveBeenCalledWith("940GZZLUEUS");
  expect(await result.json()).toMatchObject({ station: { id: "HUBEUS", name: "Euston" }, catalogue: { stationId: "HUBEUS" } });
});

it.each(["HUBEUS", "940GZZLUEUS"])("preserves request identity and decoder compatibility for %s", async id => {
  const arrivals = vi.fn(async () => [arrival({ naptanId: "940GZZLUEUS", platformName: "Southbound - Platform 2" })]);
  const get = createDeparturesHandler({ arrivals, now: () => now });
  const body = await (await get(request(`?station=${id}`))).json();
  expect(body.station.id).toBe(id);
  expect(body.catalogue.stationId).toBe("HUBEUS");
  expect(body.platforms[0]).toMatchObject({ platform: "2", direction: "Southbound", departures: [{ lineId: "northern" }] });
});

it("preserves the exact legacy King's Cross station display name", async () => {
  const arrivals = vi.fn(async () => []);
  const get = createDeparturesHandler({ arrivals, now: () => now });
  const result = await get(request("?station=940GZZLUKSX"));
  expect(result.status).toBe(200);
  expect(arrivals).toHaveBeenCalledWith("940GZZLUKSX");
  expect(await result.json()).toMatchObject({
    station: { id: "940GZZLUKSX", name: "King's Cross St. Pancras" },
    catalogue: { stationId: "HUBKGX" },
  });
});

it("assigns Colindale solely by exact published number and cardinal pair despite duplicate NaPTAN", async () => {
  const get = createDeparturesHandler({ now: () => now, arrivals: async () => [
    arrival({ id: "north", naptanId: "940GZZLUCND", platformName: "Northbound - Platform 1" }),
    arrival({ id: "south", naptanId: "940GZZLUCND", platformName: "Southbound - Platform 2" }),
    arrival({ id: "contradiction", naptanId: "940GZZLUCND", platformName: "Southbound - Platform 1", destinationName: "Edgware" }),
    arrival({ id: "direction-only", naptanId: "940GZZLUCND", platformName: undefined }),
  ] });
  const body = await (await get(request("?station=940GZZLUCND"))).json();
  expect(body.platforms.find((p: { platform: string; direction: string }) => p.platform === "1" && p.direction === "Northbound").physicalPlatformId).toBe("940GZZLUCND-Plat01-NB-northern");
  expect(body.platforms.find((p: { platform: string }) => p.platform === "2").physicalPlatformId).toBe("940GZZLUCND-Plat02-SB-northern");
  expect(body.platforms.find((p: { platform: string; direction: string }) => p.platform === "1" && p.direction === "Southbound").physicalPlatformId).toBeNull();
  expect(body.platforms.find((p: { platform: string | null }) => p.platform === null).physicalPlatformId).toBeNull();
  expect(new Set(body.catalogue.platforms.map((p: { platformNaptanCode: string }) => p.platformNaptanCode)).size).toBe(1);
});

it("maps all four Camden platforms without inventing missing published branch wording", async () => {
  const get = createDeparturesHandler({ now: () => now, arrivals: async () => [1, 2, 3, 4].map(number => arrival({ id: String(number), platformName: `${number % 2 ? "Northbound" : "Southbound"} - Platform ${number}` })) });
  const body = await (await get(request(`?station=${station}`))).json();
  expect(body.platforms.every((p: { physicalPlatformId: string | null }) => p.physicalPlatformId)).toBe(true);
  expect(body.catalogue.platforms.filter((p: { direction: string }) => p.direction === "Southbound").every((p: { services: { towards: string }[] }) => p.services.every(s => s.towards === ""))).toBe(true);
});

it("keeps the unverified Overground service discoverable beside a supported empty District feed", async () => {
  const arrivals = vi.fn(async () => []);
  const get = createDeparturesHandler({ arrivals, now: () => now });
  const result = await get(request("?station=HUBKWG"));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.platforms).toEqual([]);
  expect(body.catalogue.liveState).toBe("empty");
  expect(body.catalogue.platforms).toHaveLength(2);
  expect(body.catalogue.platforms[0].services.map((s: { lineId: string }) => s.lineId).sort()).toEqual(["district", "mildmay"]);
  expect(body.catalogue.platforms[0].services.find((s: { lineId: string }) => s.lineId === "district").capability.feed).toBe("supported");
  expect(body.catalogue.platforms[0].services.find((s: { lineId: string }) => s.lineId === "mildmay").capability.feed).toBe("unverified");
  expect(arrivals).toHaveBeenCalledWith("940GZZLUKWG");
});

it("exposes immutable supported capability separately for empty and failed Northern snapshots", async () => {
  const empty = createDeparturesHandler({ arrivals: async () => [], now: () => now });
  const failed = createDeparturesHandler({ arrivals: async () => { throw new TflError("upstream", "failure"); }, now: () => now });
  const emptyBody = await (await empty(request(`?station=${station}`))).json();
  const failedBody = await (await failed(request(`?station=${station}`))).json();
  expect(emptyBody.catalogue.liveState).toBe("empty");
  expect(failedBody.catalogue.liveState).toBe("unavailable");
  expect(emptyBody.catalogue.platforms).toEqual(failedBody.catalogue.platforms);
  expect(emptyBody.catalogue.platforms.every((p: { services: { capability: { feed: string } }[] }) => p.services.some(s => s.capability.feed === "supported"))).toBe(true);
});

it("fetches exact Underground service feeds for hubs and preserves distinct physical groups and all line identities", async () => {
  const { catalogue } = await import("@/lib/catalogue");
  const { serviceCapability } = await import("@/lib/catalogue/capability");
  const selected = catalogue.stationsById.get("HUBEUS")!;
  const lineArrivals = vi.fn(async (lineId: string, stop: string) => selected.platforms.flatMap(platform => platform.services.filter(s => s.line_id === lineId && serviceCapability(selected, platform, s).mapping === "supported").map(() => arrival({
    id: platform.platform_id, lineId, naptanId: stop, platformName: `${platform.cardinal_direction} - Platform ${platform.platform_number}`,
  }))).concat([arrival({ id: "wrong-line", lineId: "district", naptanId: stop }), arrival({ id: "wrong-stop", lineId, naptanId: "other" })]));
  const get = createDeparturesHandler({ lineArrivals, now: () => now });
  const result = await get(request("?station=HUBEUS"));
  expect(result.status).toBe(200);
  expect(lineArrivals.mock.calls).toEqual([["northern", "940GZZLUEUS"], ["victoria", "940GZZLUEUS"]]);
  const body = await result.json();
  expect(body.platforms).toHaveLength(6);
  expect(new Set(body.platforms.map((p: { physicalPlatformId: string }) => p.physicalPlatformId)).size).toBe(6);
  expect(body.platforms.flatMap((p: { departures: { lineId: string }[] }) => p.departures).map((d: { lineId: string }) => d.lineId).sort()).toEqual(["northern", "northern", "northern", "northern", "victoria", "victoria"]);
});

it("keeps successful Underground feeds usable when another service feed fails", async () => {
  const get = createDeparturesHandler({ now: () => now, lineArrivals: async line => {
    if (line === "northern") throw new TflError("upstream", "unavailable");
    return [arrival({ id: "victoria", lineId: "victoria", naptanId: "940GZZLUEUS", platformName: "Northbound - Platform 4" })];
  } });
  const result = await get(request("?station=HUBEUS"));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.platforms).toHaveLength(1);
  expect(body.catalogue.liveState).toBe("partial");
  expect(body.catalogue.feeds).toEqual([
    { lineId: "northern", stopAreaId: "940GZZLUEUS", liveState: "unavailable" },
    { lineId: "victoria", stopAreaId: "940GZZLUEUS", liveState: "available" },
  ]);
});

it.each(["bakerloo", "central", "circle", "district", "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly", "victoria", "waterloo-city"])("serves a verified %s platform through the handler and public decoder", async lineId => {
  const { catalogue } = await import("@/lib/catalogue");
  const { serviceCapability } = await import("@/lib/catalogue/capability");
  const { parseDeparturesResponse } = await import("@/lib/departure-view");
  const match = catalogue.stations.flatMap(station => station.platforms.flatMap(platform => platform.services.filter(service => service.line_id === lineId && serviceCapability(station, platform, service).mapping === "supported").map(service => ({ station, platform, service })) ))[0]!;
  const get = createDeparturesHandler({ now: () => now, lineArrivals: async (line, stop) => line === lineId && stop === match.service.stop_area_naptan_code ? [arrival({ lineId, naptanId: stop, platformName: `${match.platform.cardinal_direction} - Platform ${match.platform.platform_number}` })] : [] });
  const result = await get(request(`?station=${match.station.station_id}`));
  const parsed = parseDeparturesResponse(await result.json(), match.station.station_id)!;
  expect(result.status).toBe(200);
  expect(parsed.platforms).toHaveLength(1);
  expect(parsed.platforms[0]).toMatchObject({ physicalPlatformId: match.platform.platform_id, direction: match.platform.cardinal_direction, departures: [{ lineId }] });
});
