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
