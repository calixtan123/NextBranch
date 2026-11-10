/** Exercises the real server response through the native decoder and board projection. */
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDeparturesHandler } from "../../src/app/api/departures/route";
import { arrivalSchema, parseArrivals } from "../../src/lib/northern/schemas";
import { decodeSnapshot } from "../src/api";
import { boardRows } from "../src/board-model";

const now = new Date("2026-09-16T12:00:00.000Z");
const request = (query: string) => new Request(`http://local/api/departures${query}`);
const arrival = (value: Record<string, unknown>) => arrivalSchema.parse({
  id: "one", vehicleId: "v1", lineId: "dlr", naptanId: "940GZZDLCAN",
  destinationName: "Morden via Bank", expectedArrival: "2026-09-16T12:02:00.000Z",
  timestamp: "2026-09-16T11:59:00.000Z", direction: "inbound", towards: "Morden via Bank",
  ...value,
});

it("serves the DLR service stop beneath a hub, retains source blanks and prevents cross-feed/platform leakage", async () => {
  const lineArrivals = vi.fn(async (lineId: string) => lineId !== "dlr" ? [] : [
    arrival({ id: "three", lineId: "dlr", naptanId: "940GZZDLCAN", platformName: "Platform 3", destinationName: "", towards: "" }),
    arrival({ id: "four", lineId: "dlr", naptanId: "940GZZDLCAN", platformName: "Platform 4" }),
    arrival({ id: "unassigned", lineId: "dlr", naptanId: "940GZZDLCAN", platformName: undefined, direction: "inbound" }),
    arrival({ id: "wrong-stop", lineId: "dlr", naptanId: "other", platformName: "Platform 3" }),
    arrival({ id: "wrong-line", lineId: "jubilee", naptanId: "940GZZDLCAN", platformName: "Platform 3" }),
  ]);
  const get = createDeparturesHandler({ now: () => now, lineArrivals });
  const result = await get(request("?station=HUBCAW"));
  const body = decodeSnapshot(await result.json(), "HUBCAW");
  expect(result.status).toBe(200);
  expect(lineArrivals.mock.calls).toEqual([["dlr", "940GZZDLCAN"], ["jubilee", "940GZZLUCYF"]]);
  expect(body.platforms).toHaveLength(3);
  expect(body.platforms[0]).toMatchObject({ physicalPlatformId: "HUBCAW-Plat03-dlr", platform: "3", direction: null, departures: [{ lineId: "dlr", destinationName: "", towards: "" }] });
  expect(body.platforms[1].physicalPlatformId).not.toBe(body.platforms[0].physicalPlatformId);
  expect(body.platforms[2].physicalPlatformId).toBeNull();
  expect(body.catalogue!.platforms.find(p => p.platformNumber === "3")).toMatchObject({ direction: "", services: [{ lineId: "dlr", towards: "" }] });
});

it("maps all official DLR fixture records and displays only each matched physical platform's published direction", async () => {
  const fixture = (await import("../../data/tfl-dlr-canary-wharf-fixture.json")).default;
  const get = createDeparturesHandler({ now: () => new Date("2026-11-10T18:58:00Z"), lineArrivals: async lineId => lineId === "dlr" ? parseArrivals(fixture.predictions) : [] });
  const result = await get(request("?station=HUBCAW"));
  const body = decodeSnapshot(await result.json(), "HUBCAW");
  expect(result.status).toBe(200);
  expect(body.platforms).toHaveLength(6);
  expect(body.platforms.flatMap(p => p.departures)).toHaveLength(18);
  expect(body.platforms.map(p => [p.platform, p.direction, p.departures.length])).toEqual([
    ["1", "Southbound", 3], ["2", "Southbound", 3], ["3", null, 3], ["4", null, 3], ["5", "Northbound", 3], ["6", "Northbound", 3],
  ]);
  const selected = { stationId: "HUBCAW", physicalPlatformId: "HUBCAW-Plat03-dlr", platform: "3", direction: "" as const };
  expect(boardRows(body, selected, Date.parse(body.observedAt), 5)).toHaveLength(3);
});

it('carries all six official Overground fixture responses through the real native decoder and physical board projection', async () => {
  const fixtures = (await import('../../data/tfl-overground-fixtures.json')).default;
  const { catalogue } = await import('../../src/lib/catalogue');
  const { physicalPlatformForTrain } = await import('../../src/lib/catalogue/capability');
  const { normalizeRailPredictions } = await import('../../src/lib/rail/departures');
  for (const feed of fixtures.feeds) {
    const station = catalogue.stationsById.get(feed.stationId)!;
    const predictions = parseArrivals(feed.predictions);
    const now = new Date(feed.observedAt);
    const get = createDeparturesHandler({ now: () => now, lineArrivals: async (lineId, stopAreaId) => lineId === feed.lineId && stopAreaId === feed.stopAreaId ? predictions : [] });
    const response = await get(request('?station=' + feed.stationId));
    const snapshot = decodeSnapshot(await response.json(), feed.stationId);
    const expected = normalizeRailPredictions(predictions, now);
    expect(snapshot.platforms.flatMap(p => p.departures), feed.lineId).toHaveLength(expected.length);
    for (const platform of station.platforms.filter(p => p.services.some(s => s.line_id === feed.lineId))) {
      const selection = { stationId: feed.stationId, physicalPlatformId: platform.platform_id, platform: platform.platform_number, direction: platform.cardinal_direction as 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound' | '' };
      const rows = boardRows(snapshot, selection, now.getTime(), 5);
      const matched = expected.filter(train => physicalPlatformForTrain(station, train) === platform.platform_id);
      expect(rows, feed.lineId + '/' + platform.platform_number).toHaveLength(Math.min(matched.length, 5));
      expect(rows.every(row => row.lineId === feed.lineId)).toBe(true);
    }
  }
});
