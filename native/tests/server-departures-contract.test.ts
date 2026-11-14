/** Exercises the real server response through the native decoder and board projection. */
import { expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { createDeparturesHandler } from "../../src/app/api/departures/route";
import { arrivalSchema, parseArrivals } from "../../src/lib/northern/schemas";
import { decodeSnapshot } from "../src/api";
import { boardRows, boardStatus, unassignedCount } from "../src/board-model";
import { catalogue } from "../../src/lib/catalogue";

// Frozen Zod response shapes from 59e60fe's catalogue capability and native API modules.
const baselineCatalogue = z.object({
  stationId: z.string(),
  liveState: z.enum(["available", "empty", "unverified", "unavailable", "partial"]),
  feeds: z.array(z.object({ lineId: z.string(), stopAreaId: z.string(), liveState: z.enum(["available", "empty", "unavailable"]) })).optional(),
  platforms: z.array(z.object({
    platformId: z.string(), platformNumber: z.string(), description: z.string(),
    direction: z.string(), platformNaptanCode: z.string(),
    services: z.array(z.object({
      lineId: z.string(), lineName: z.string(), mode: z.string(), towards: z.string(),
      stopAreaId: z.string(), capability: z.object({
        feed: z.enum(["supported", "unsupported", "unverified"]),
        mapping: z.enum(["supported", "unsupported", "unverified"]),
        evidence: z.string(),
      }),
    })),
  })),
});
const baselineTimestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const baselineExactLabel = z.string().min(1).refine(value => value === value.trim());
const baselineSnapshot = z.object({
  station: z.object({ id: z.string().min(1), name: z.string().trim().min(1) }),
  observedAt: baselineTimestamp,
  newestPredictionGeneratedAt: baselineTimestamp.nullable(),
  refreshAfterSeconds: z.number().int().positive().optional().default(30),
  catalogue: baselineCatalogue.optional(),
  platforms: z.array(z.object({
    physicalPlatformId: baselineExactLabel.nullable().optional(),
    platform: z.string().refine(value => value === value.trim()).nullable(),
    direction: z.enum(["Northbound", "Southbound", "Eastbound", "Westbound"]).nullable(),
    departures: z.array(z.object({
      id: baselineExactLabel,
      lineId: baselineExactLabel.optional(),
      destinationName: z.string().nullable(),
      expectedArrival: baselineTimestamp,
      secondsToStation: z.number().finite(),
      towards: z.string().nullable(),
    })),
  })),
});

const now = new Date("2026-09-16T12:00:00.000Z");
const request = (query: string) => new Request(`http://local/api/departures${query}`);
const arrival = (value: Record<string, unknown>) => arrivalSchema.parse({
  id: "one", vehicleId: "v1", lineId: "dlr", naptanId: "940GZZDLCAN",
  destinationName: "Morden via Bank", expectedArrival: "2026-09-16T12:02:00.000Z",
  timestamp: "2026-09-16T11:59:00.000Z", direction: "inbound", towards: "Morden via Bank",
  ...value,
});

it.each(["mixed freshness", "all stale"] as const)("keeps the baseline native contract for %s", async condition => {
  const stationId = "HUBKWG";
  const allStale = condition === "all stale";
  const district = { lineId: "district", stopAreaId: "940GZZLUKWG" };
  const mildmay = { lineId: "mildmay", stopAreaId: "910GKEWGRDN" };
  const staleTimestamp = "2026-09-16T11:00:00Z";
  const get = createDeparturesHandler({ now: () => now, lineArrivals: async (lineId, naptanId) => [
    arrival({ lineId, naptanId, platformName: lineId === "district" ? "Eastbound - Platform 1" : "Platform 1",
      timestamp: allStale || lineId === "mildmay" ? staleTimestamp : "2026-09-16T11:59:00Z" }),
  ] });
  const response = await get(request("?station=" + stationId));
  expect(response.status).toBe(200);
  const payload = await response.json();
  const baseline = baselineSnapshot.parse(payload);
  expect(baseline.station.id).toBe(stationId);
  expect(baseline.catalogue?.liveState).toBe(allStale ? "empty" : "available");
  expect(baseline.catalogue?.feeds).toEqual([
    { ...district, liveState: allStale ? "empty" : "available" },
    { ...mildmay, liveState: "empty" },
  ]);
  expect(baseline.platforms.flatMap(group => group.departures.map(departure => departure.lineId)))
    .toEqual(allStale ? [] : ["district"]);

  const snapshot = decodeSnapshot(payload, stationId);
  expect(snapshot.catalogue?.feeds?.map(feed => feed.freshness)).toEqual([allStale ? "stale" : undefined, "stale"]);
  const state = { pending: false, error: null, snapshot };
  expect(boardStatus(state, now.getTime(), true, [district, mildmay])).toEqual({
    tone: "warning",
    label: allStale ? "No recent departures available" : "No recent departures available for some services",
  });
  expect(boardStatus(state, now.getTime(), true, [mildmay]).label).toBe("No recent departures available");
  expect(boardStatus(state, now.getTime(), true, [district]).label)
    .toBe(allStale ? "No recent departures available" : "Live departures up to date");
});

it('projects raw Acton Town labels through normalization and exact physical assignment with dedupe and freshness filtering', async () => {
  const stationId = '940GZZLUACT';
  const raw = [
    arrival({ id: 'east', lineId: 'district', naptanId: stationId, platformName: 'Eastbound - Platform 4' }),
    arrival({ id: 'west', lineId: 'district', naptanId: stationId, platformName: 'Westbound - Platform 1' }),
    arrival({ id: 'unmapped', lineId: 'district', naptanId: stationId, platformName: 'Eastbound - Platform 99' }),
    arrival({ id: 'missing', lineId: 'district', naptanId: stationId, platformName: undefined }),
    arrival({ id: 'stale', lineId: 'district', naptanId: stationId, platformName: 'Eastbound - Platform 4', timestamp: '2026-09-16T11:00:00Z' }),
    arrival({ id: 'wrong-stop', lineId: 'district', naptanId: 'other', platformName: 'Eastbound - Platform 4' }),
  ];
  const handler = createDeparturesHandler({ now: () => now, lineArrivals: async line => line === 'district' ? [...raw, raw[0]] : [] });
  const result = await handler(request('?station=' + stationId));
  const body = decodeSnapshot(await result.json(), stationId);
  expect(result.status).toBe(200);
  expect(body.platforms.flatMap(group => group.departures)).toHaveLength(4);
  const station = catalogue.stationsById.get(stationId)!;
  for (const [number, direction, id] of [['4', 'Eastbound', 'east'], ['1', 'Westbound', 'west']] as const) {
    const platform = station.platforms.find(item => item.platform_number === number)!;
    const rows = boardRows(body, { stationId, platform: number, direction, physicalPlatformId: platform.platform_id }, now.getTime(), 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toContain(id);
  }
  expect(unassignedCount(body, now.getTime())).toBe(2);
  expect(body.catalogue!.platforms.find(platform => platform.platformNumber === '4')!.services
    .find(service => service.lineId === 'district')!.capability.mapping).toBe('unverified');
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
  expect(lineArrivals.mock.calls).toEqual([["dlr", "940GZZDLCAN"], ["elizabeth", "910GCANWHRF"], ["jubilee", "940GZZLUCYF"]]);
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

it('projects ten official Elizabeth responses onto exact published platforms, retaining mainline alias responses as unassigned', async () => {
  const fixture = (await import('../../data/tfl-elizabeth-fixtures.json')).default;
  const { catalogue } = await import('../../src/lib/catalogue');
  const { createCanonicalCatalogue } = await import('../src/catalogue');
  const canonical = createCanonicalCatalogue(catalogue);
  const expectedPlatforms: Record<string, string[]> = {
    '910GABWDXR': ['3', '4'], '910GFRNDXR': ['A', 'B'], '910GLIVSTLL': ['A', 'B'], '910GLIVST': [],
    '910GPADTLL': ['A', 'B'], '910GPADTON': [], '910GEALINGB': ['3', '4'], '910GRDNGSTN': ['14'],
    '910GSHENFLD': ['5', '6'], '910GHTRWTM5': ['4'],
  };
  for (const feed of fixture.feeds) {
    const now = new Date(feed.observedAt);
    const predictions = parseArrivals(feed.predictions);
    const lineArrivals = vi.fn(async (lineId: string, stop: string) => lineId === 'elizabeth' && stop === feed.stopAreaId ? predictions : []);
    const result = await createDeparturesHandler({ now: () => now, lineArrivals })(request('?station=' + feed.stationId));
    const body = decodeSnapshot(await result.json(), feed.stationId);
    expect(result.status).toBe(200);
    const groups = body.platforms.filter(p => p.physicalPlatformId);
    expect(groups.map(p => p.platform).sort(), feed.stopAreaId).toEqual(expectedPlatforms[feed.stopAreaId].slice().sort());
    expect(body.platforms.flatMap(p => p.departures), feed.stopAreaId).toHaveLength(feed.stopAreaId === '910GHTRWTM5' ? 7 : predictions.length);
    const station = catalogue.stationsById.get(feed.stationId)!;
    for (const group of groups) {
      const platform = station.platforms.find(p => p.platform_id === group.physicalPlatformId)!;
      expect(group.direction).toBe(platform.cardinal_direction);
      const selection = canonical.selection(station, platform)!;
      const rows = boardRows(body, selection, now.getTime(), 5);
      expect(rows).toHaveLength(Math.min(group.departures.length, 5));
      expect(rows.every(row => row.lineId === 'elizabeth')).toBe(true);
    }
    if (!expectedPlatforms[feed.stopAreaId].length) {
      expect(body.platforms.every(p => p.physicalPlatformId === null && p.direction === null)).toBe(true);
    }
  }
});

it('projects eight official Tram responses to exact blank-number physical platforms and retains both cable-car empty observations browse-only', async () => {
  const fixture = (await import('../../data/tfl-tram-cable-fixtures.json')).default;
  const { catalogue } = await import('../../src/lib/catalogue');
  const { createCanonicalCatalogue } = await import('../src/catalogue');
  const canonical = createCanonicalCatalogue(catalogue);
  const expectedDirections: Record<string, string[]> = {
    '940GZZCRADD': ['Eastbound', 'Westbound'], '940GZZCRECR': [], '940GZZCRELM': [], '940GZZCRBEK': [],
    '940GZZCRWMB': [], '940GZZCRNWA': [], '940GZZCRBIR': ['Eastbound'], '940GZZCRBRD': ['Eastbound'],
    '940GZZALGWP': [], '940GZZALRDK': [],
  };
  for (const feed of fixture.feeds) {
    const now = new Date(feed.observedAt);
    const predictions = parseArrivals(feed.predictions);
    const lineArrivals = vi.fn(async (lineId: string, stop: string) => lineId === feed.lineId && stop === feed.stopAreaId ? predictions : []);
    const result = await createDeparturesHandler({ now: () => now, lineArrivals })(request('?station=' + feed.stationId));
    const body = decodeSnapshot(await result.json(), feed.stationId);
    expect(result.status).toBe(200);
    const groups = body.platforms.filter(p => p.physicalPlatformId);
    expect(groups.map(p => p.direction).sort(), feed.stopAreaId).toEqual(expectedDirections[feed.stopAreaId].slice().sort());
    expect(body.platforms.flatMap(p => p.departures), feed.stopAreaId).toHaveLength(predictions.length);
    const station = catalogue.stationsById.get(feed.stationId)!;
    for (const group of groups) {
      const platform = station.platforms.find(p => p.platform_id === group.physicalPlatformId)!;
      expect(group.platform).toBe('');
      const selection = canonical.selection(station, platform)!;
      expect(selection.platform).toBe('');
      expect(boardRows(body, selection, now.getTime(), 5)).toHaveLength(Math.min(group.departures.length, 5));
    }
    if (feed.lineId === 'london-cable-car') {
      expect(lineArrivals).not.toHaveBeenCalled();
      expect(body.catalogue!.liveState).toBe('unverified');
      expect(canonical.selection(station, station.platforms[0]!)).toBeNull();
    }
  }
});

it('joins both exact official Kew feeds on platform 1 and keeps platform 2 and unknown labels separate', async () => {
  const fixture = (await import('../../data/tfl-shared-kew-fixtures.json')).default;
  const { catalogue } = await import('../../src/lib/catalogue');
  const { createCanonicalCatalogue } = await import('../src/catalogue');
  const station = catalogue.stationsById.get('HUBKWG')!;
  const frozen = new Date(fixture.feeds[0].observedAt);
  const get = createDeparturesHandler({ now: () => frozen, lineArrivals: async (lineId, stop) => {
    const feed = fixture.feeds.find(feed => feed.lineId === lineId && feed.stopAreaId === stop)!;
    return parseArrivals([...feed.predictions, ...feed.predictions]);
  } });
  const response = await get(request('?station=HUBKWG'));
  const snapshot = decodeSnapshot(await response.json(), 'HUBKWG');
  const canonical = createCanonicalCatalogue(catalogue);
  const one = canonical.selection(station, station.platforms[0])!;
  const two = canonical.selection(station, station.platforms[1])!;
  const firstRows = boardRows(snapshot, one, frozen.getTime(), 5);
  const secondRows = boardRows(snapshot, two, frozen.getTime(), 5);
  expect(new Set(firstRows.map(row => row.lineId))).toEqual(new Set(['district', 'mildmay']));
  expect(new Set(secondRows.map(row => row.lineId))).toEqual(new Set(['mildmay']));
  expect(new Set(firstRows.map(row => row.id)).size).toBe(firstRows.length);
  expect(firstRows.some(row => secondRows.some(other => other.id === row.id))).toBe(false);
  expect(snapshot.platforms.some(platform => !platform.physicalPlatformId)).toBe(true);
  expect(snapshot.catalogue?.feeds?.map(feed => feed.liveState)).toEqual(['available', 'available']);
});
