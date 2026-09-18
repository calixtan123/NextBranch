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
    expect(await (await configuration(request(`?station=${station}`))).json()).toEqual({ error: "CONFIGURATION_ERROR" });
    expect((await configuration(request(`?station=${station}`))).status).toBe(500);
    expect((await upstream(request(`?station=${station}`))).status).toBe(503);
    expect(await (await upstream(request(`?station=${station}`))).json()).toEqual({ error: "TFL_UNAVAILABLE" });
  });
});
