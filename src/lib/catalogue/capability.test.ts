/** Verify conservative mapping decisions independently of live snapshot state. */
import { describe, expect, it } from "vitest";
import { catalogue } from "./index";
import { catalogueMetadata, departureFeeds, northernStopAreas, physicalPlatformForTrain, serviceCapability } from "./capability";
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
  expect(undergroundFeeds(kew)).toEqual([{ lineId: "district", stopAreaId: "940GZZLUKWG" }, { lineId: "mildmay", stopAreaId: "910GKEWGRDN" }]);
  expect(serviceCapability(kew, kew.platforms[0]!, kew.platforms[0]!.services.find(s => s.line_id === "mildmay")!)).toMatchObject({ feed: "supported", mapping: "supported" });
});

it("requires matching line and service stop area before assigning a same-number physical platform", () => {
  const euston = catalogue.stationsById.get("HUBEUS")!;
  const train = { ...normalizePredictions([{ id: "t", lineId: "northern", naptanId: "940GZZLUEUS", expectedArrival: "2026-11-10T12:01:00Z", platformName: "Northbound - Platform 3" }], now)[0]!, stopAreaId: "different-stop" };
  expect(physicalPlatformForTrain(euston, train)).toBeNull();
});

it("verifies DLR's exact unique service/platform number while preserving blank directions and towards", async () => {
  const { departureFeeds } = await import("./capability");
  const station = catalogue.stationsById.get("HUBCAW")!;
  const platform = station.platforms.find(p => p.platform_number === "3")!;
  const service = platform.services.find(s => s.line_id === "dlr")!;
  expect(platform.cardinal_direction).toBe("");
  expect(service.direction_towards).toBe("");
  expect(serviceCapability(station, platform, service)).toMatchObject({ feed: "supported", mapping: "supported" });
  expect(departureFeeds(station)).toEqual([{ lineId: "dlr", stopAreaId: "940GZZDLCAN" }, { lineId: "elizabeth", stopAreaId: "910GCANWHRF" }, { lineId: "jubilee", stopAreaId: "940GZZLUCYF" }]);
  const train = { platformConfirmed: true, platform: "3", direction: null, lineId: "dlr", stopAreaId: "940GZZDLCAN" };
  expect(physicalPlatformForTrain(station, train)).toBe(platform.platform_id);
  for (const wrong of [{ stopAreaId: "other" }, { stopAreaId: undefined }, { lineId: "mildmay" }, { platform: "99" }, { platformConfirmed: false }]) {
    expect(physicalPlatformForTrain(station, { ...train, ...wrong })).toBeNull();
  }
  const ambiguous = { ...station, platforms: [...station.platforms, { ...platform, platform_id: "duplicate-number", cardinal_direction: "Northbound" as const }] };
  expect(serviceCapability(ambiguous, platform, service).mapping).toBe("unverified");
  expect(physicalPlatformForTrain(ambiguous, train)).toBeNull();
  expect(serviceCapability(station, { ...platform, platform_number: "99" }, service).mapping).toBe("unverified");
  expect(catalogueMetadata(station, "empty").platforms).toEqual(catalogueMetadata(station, "unavailable").platforms);
});

it.each([["HUBLEW", "5"], ["HUBTOG", "1"]])("assigns an explicit unique live DLR identity %s/%s while retaining static save eligibility", (stationId, number) => {
  const station = catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number)!;
  const service = platform.services.find(s => s.line_id === "dlr")!;
  expect(serviceCapability(station, platform, service)).toMatchObject({ feed: "supported", mapping: "unverified" });
  expect(physicalPlatformForTrain(station, { platformConfirmed: true, platform: number, direction: null, lineId: "dlr", stopAreaId: service.stop_area_naptan_code })).toBe(platform.platform_id);
});

it('assigns the unique explicit Acton Town eastbound live identity without changing static capabilities', () => {
  const station = catalogue.stationsById.get('940GZZLUACT')!;
  const platform = station.platforms.find(item => item.platform_number === '4')!;
  const service = platform.services.find(item => item.line_id === 'district')!;
  const train = { lineId: 'district', stopAreaId: service.stop_area_naptan_code,
    platform: '4', direction: 'Eastbound' as const, platformConfirmed: true };
  expect(serviceCapability(station, platform, service).mapping).toBe('unverified');
  expect(physicalPlatformForTrain(station, train)).toBe(platform.platform_id);
  for (const extra of [{ direction: 'Westbound' as const }, { stopAreaId: 'other' },
    { lineId: 'circle' }, { platformConfirmed: false }]) {
    expect(physicalPlatformForTrain(station, { ...train, ...extra })).toBeNull();
  }
  const ambiguous = { ...station, platforms: [...station.platforms, { ...platform, platform_id: 'duplicate' }] };
  expect(physicalPlatformForTrain(ambiguous, train)).toBeNull();
});

it("reviews 99 of 101 DLR platform/service pairs without expanding other modes and returns no feeds for empty stations", async () => {
  const { departureFeeds } = await import("./capability");
  const dlr = catalogue.stations.flatMap(station => station.platforms.flatMap(platform => platform.services.filter(service => service.line_id === "dlr").map(service => serviceCapability(station, platform, service))));
  expect(dlr).toHaveLength(101);
  expect(dlr.filter(c => c.mapping === "supported")).toHaveLength(99);
  expect(dlr.every(c => c.feed === "supported")).toBe(true);
  expect(departureFeeds({ ...colindale, platforms: [] })).toEqual([]);
  for (const lineId of ["london-cable-car"]) {
    const platform = colindale.platforms[0];
    expect(serviceCapability(colindale, platform, { ...platform.services[0], line_id: lineId })).toMatchObject({ feed: "unverified", mapping: "unverified" });
  }
});

it.each([
  ['liberty', 4, 2], ['lioness', 41, 33], ['mildmay', 58, 56],
  ['suffragette', 26, 8], ['weaver', 57, 54], ['windrush', 59, 57],
])('reviews exact current %s service mappings, retaining unobserved and ambiguous pairs', (line, total, verified) => {
  const pairs = catalogue.stations.flatMap(station => station.platforms.flatMap(platform => platform.services
    .filter(service => service.line_id === line).map(service => serviceCapability(station, platform, service))));
  expect(pairs).toHaveLength(total as number);
  expect(pairs.filter(c => c.mapping === 'supported')).toHaveLength(verified as number);
  expect(pairs.every(c => c.feed === 'supported')).toBe(true);
});

it('leaves the two Emerson Park physical records unassigned despite the observed Liberty Platform 1 label', () => {
  const station = catalogue.stationsById.get('910GEMRSPKH')!;
  expect(station.platforms).toHaveLength(2);
  for (const platform of station.platforms) expect(serviceCapability(station, platform, platform.services[0]!)).toMatchObject({ feed: 'supported', mapping: 'unverified' });
  expect(physicalPlatformForTrain(station, { lineId: 'liberty', stopAreaId: station.station_id, platformConfirmed: true, platform: '1', direction: null })).toBeNull();
});

it('matches current service identity beneath historical Overground IDs while preserving shared National Rail coverage', () => {
  const station = catalogue.stationsById.get('HUBEUS')!;
  const platform = station.platforms.find(p => p.platform_number === '9')!;
  expect(platform.platform_id).toContain('london-overground');
  expect(physicalPlatformForTrain(station, { lineId: 'lioness', stopAreaId: '910GEUSTON', platformConfirmed: true, platform: '9', direction: null })).toBe(platform.platform_id);
  for (const extra of [{ lineId: 'london-overground' }, { lineId: 'weaver' }, { stopAreaId: 'HUBEUS' }, { stopAreaId: undefined }, { direction: 'Southbound' as const }]) {
    expect(physicalPlatformForTrain(station, { lineId: 'lioness', stopAreaId: '910GEUSTON', platformConfirmed: true, platform: '9', direction: null, ...extra })).toBeNull();
  }
  const metadata = catalogueMetadata(station, 'empty');
  expect(metadata.platforms.find(p => p.platformNumber === '9')!.services.map(s => [s.lineId, s.capability.feed])).toEqual([['lioness', 'supported'], ['national-rail', 'unsupported']]);
  expect(metadata.platforms).toEqual(catalogueMetadata(station, 'unavailable').platforms);
});

it('verifies Elizabeth numbered and letter platforms by exact service stop and preserves shared National Rail descriptions', () => {
  const station = catalogue.stationsById.get('HUBEAL')!;
  const platform = station.platforms.find(p => p.platform_number === '3')!;
  const service = platform.services.find(s => s.line_id === 'elizabeth')!;
  expect(serviceCapability(station, platform, service)).toMatchObject({ feed: 'supported', mapping: 'supported' });
  const train = { lineId: 'elizabeth', stopAreaId: '910GEALINGB', platform: '3', direction: null, platformConfirmed: true };
  expect(physicalPlatformForTrain(station, train)).toBe(platform.platform_id);
  for (const extra of [{ stopAreaId: 'HUBEAL' }, { stopAreaId: undefined }, { lineId: 'national-rail' }, { platform: '99' }, { direction: 'Eastbound' as const }]) {
    expect(physicalPlatformForTrain(station, { ...train, ...extra })).toBeNull();
  }
  const unreviewed = station.platforms.find(item => item.platform_number === '1')!;
  expect(physicalPlatformForTrain(station, { ...train, platform: '1' })).toBe(unreviewed.platform_id);
  const duplicate = { ...station, platforms: [...station.platforms, { ...platform, platform_id: 'duplicate', cardinal_direction: 'Eastbound' as const }] };
  expect(serviceCapability(duplicate, platform, service).mapping).toBe('unverified');
  expect(catalogueMetadata(station, 'empty').platforms.find(p => p.platformNumber === '3')!.services.map(s => [s.lineId, s.capability.feed])).toEqual([['elizabeth', 'supported'], ['national-rail', 'unsupported']]);
  expect(catalogueMetadata(station, 'empty').platforms).toEqual(catalogueMetadata(station, 'unavailable').platforms);
});

it.each([['HUBPAD', '910GPADTLL', '910GPADTON'], ['HUBLST', '910GLIVSTLL', '910GLIVST']])('keeps %s central-section letters separate from numbered mainline platforms', (id, lowLevel, mainline) => {
  const station = catalogue.stationsById.get(id)!;
  const letter = station.platforms.find(p => p.platform_number === 'A')!;
  expect(physicalPlatformForTrain(station, { lineId: 'elizabeth', stopAreaId: lowLevel, platform: 'A', direction: null, platformConfirmed: true })).toBe(letter.platform_id);
  expect(physicalPlatformForTrain(station, { lineId: 'elizabeth', stopAreaId: mainline, platform: 'A', direction: null, platformConfirmed: true })).toBeNull();
  expect(departureFeeds(station)).toContainEqual({ lineId: 'elizabeth', stopAreaId: mainline });
  for (const platform of station.platforms.filter(p => p.services.some(s => s.line_id === 'elizabeth' && s.stop_area_naptan_code === mainline))) {
    expect(serviceCapability(station, platform, platform.services.find(s => s.line_id === 'elizabeth')!)).toMatchObject({ feed: 'supported', mapping: 'unverified' });
  }
});

it('supports all 139 Elizabeth platform/service feeds while verifying exactly 80 physical pairs across all 41 stations', () => {
  const stations = catalogue.stations.filter(station => station.platforms.some(p => p.services.some(s => s.line_id === 'elizabeth')));
  const pairs = stations.flatMap(station => station.platforms.flatMap(platform => platform.services.filter(s => s.line_id === 'elizabeth').map(service => serviceCapability(station, platform, service))));
  expect(stations).toHaveLength(41);
  expect(pairs).toHaveLength(139);
  expect(pairs.every(pair => pair.feed === 'supported')).toBe(true);
  expect(pairs.filter(pair => pair.mapping === 'supported')).toHaveLength(80);
  expect(pairs.filter(pair => pair.mapping === 'unverified')).toHaveLength(59);
});

it('verifies exactly 60 of 68 Tram physical pairs across 39 stations while retaining all source blanks', () => {
  const stations = catalogue.stations.filter(s => s.platforms.some(p => p.services.some(v => v.line_id === 'tram')));
  const pairs = stations.flatMap(station => station.platforms.flatMap(platform => platform.services.filter(s => s.line_id === 'tram').map(service => ({ platform, capability: serviceCapability(station, platform, service) }))));
  expect(stations).toHaveLength(39);
  expect(pairs).toHaveLength(68);
  expect(pairs.every(p => p.capability.feed === 'supported')).toBe(true);
  expect(pairs.filter(p => p.capability.mapping === 'supported')).toHaveLength(60);
  expect(pairs.filter(p => p.platform.platform_number === '')).toHaveLength(67);
});
it('requires unique exact Tram blank-number/cardinal/service identity without interpreting IDs or destinations', () => {
  const station = catalogue.stationsById.get('940GZZCRADD')!;
  const platform = station.platforms.find(p => p.cardinal_direction === 'Eastbound')!;
  const service = platform.services[0]!;
  const train = { lineId: 'tram', stopAreaId: service.stop_area_naptan_code, platform: '', direction: 'Eastbound' as const, platformConfirmed: true };
  expect(serviceCapability(station, platform, service)).toMatchObject({ feed: 'supported', mapping: 'supported' });
  expect(physicalPlatformForTrain(station, train)).toBe(platform.platform_id);
  for (const extra of [{ platform: '1' }, { platform: null }, { direction: null }, { stopAreaId: undefined }, { stopAreaId: 'other' }, { lineId: 'dlr' }, { platformConfirmed: false }]) {
    expect(physicalPlatformForTrain(station, { ...train, ...extra })).toBeNull();
  }
  const duplicate = { ...station, platforms: [...station.platforms, { ...platform, platform_id: 'duplicate' }] };
  expect(serviceCapability(duplicate, platform, service).mapping).toBe('unverified');
  expect(physicalPlatformForTrain(duplicate, train)).toBeNull();
  const numbered = { ...platform, platform_number: '1' };
  const changed = { ...station, platforms: [numbered] };
  expect(serviceCapability(changed, numbered, service).mapping).toBe('unverified');
  expect(physicalPlatformForTrain(changed, train)).toBeNull();
  expect(departureFeeds(station)).toEqual([{ lineId: 'tram', stopAreaId: station.station_id }]);
  expect(catalogueMetadata(station, 'empty').platforms).toEqual(catalogueMetadata(station, 'unavailable').platforms);
});
it.each([['HUBECY', '', 'Eastbound'], ['HUBECY', '', 'Westbound'], ['HUBWIM', '', 'Eastbound'], ['940GZZCRNWA', '', 'Westbound'], ['HUBELM', '1', 'Westbound'], ['HUBBEK', '', 'Westbound'], ['HUBBIR', '', 'Westbound'], ['940GZZCRBRD', '', 'Westbound']])('keeps unmatched Tram %s/%s/%s browse-only', (id, number, direction) => {
  const station = catalogue.stationsById.get(id)!;
  const platform = station.platforms.find(p => p.platform_number === number && p.cardinal_direction === direction && p.services.some(s => s.line_id === 'tram'))!;
  expect(serviceCapability(station, platform, platform.services.find(s => s.line_id === 'tram')!)).toMatchObject({ feed: 'supported', mapping: 'unverified' });
});
it.each(['940GZZALGWP', '940GZZALRDK'])('retains official cable-car %s browse-only without classifying an empty response as unsupported', id => {
  const station = catalogue.stationsById.get(id)!;
  expect(station.platforms).toHaveLength(1);
  const platform = station.platforms[0]!;
  expect(platform.platform_number).toBe('');
  expect(serviceCapability(station, platform, platform.services[0]!)).toMatchObject({ feed: 'unverified', mapping: 'unverified', evidence: expect.stringContaining('empty') });
  expect(departureFeeds(station)).toEqual([]);
  expect(physicalPlatformForTrain(station, { lineId: 'london-cable-car', stopAreaId: id, platform: '', direction: null, platformConfirmed: true })).toBeNull();
});

it('preserves an unknown Tram cardinal direction as unverified without deriving it from the published ID', () => {
  const original = catalogue.stationsById.get('940GZZCRADD')!;
  const platform = { ...original.platforms[0]!, cardinal_direction: '' as const };
  const station = { ...original, platforms: [platform] };
  expect(platform.platform_id).toContain('-EB-');
  expect(serviceCapability(station, platform, platform.services[0]!)).toMatchObject({ feed: 'supported', mapping: 'unverified' });
  expect(catalogueMetadata(station, 'empty').platforms[0]).toMatchObject({ platformNumber: '', direction: '' });
});

it('verifies Kew shared District platform 1 from the new official exact live label without widening platform 2', () => {
  const station = catalogue.stationsById.get('HUBKWG')!;
  const metadata = catalogueMetadata(station, 'empty');
  expect(metadata.platforms.map(platform => [platform.platformNumber, platform.services.map(service => [service.lineId, service.capability.mapping])])).toEqual([
    ['1', [['district', 'supported'], ['mildmay', 'supported']]],
    ['2', [['district', 'unverified'], ['mildmay', 'supported']]],
  ]);
});
