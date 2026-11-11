/** Regression coverage for the offline physical-platform catalogue boundary. */
import { describe, expect, it } from "vitest";
import source from "../../../data/tfl-station-platform-inventory/tfl-station-platform-lines.json";
import { catalogue, createCatalogue, searchCatalogue } from "./index";
import { validateSnapshot } from "./schema";

describe("TfL catalogue", () => {
  it("filters passenger platforms while preserving every service on a shared platform", () => {
    const kew = catalogue.stationsById.get("HUBKWG")!;
    expect(kew.platforms).toHaveLength(2);
    expect(kew.platforms.every(p => p.services.map(s => s.line_id).sort().join() === "district,mildmay")).toBe(true);
    const shared = catalogue.stations.flatMap(s => s.platforms).find(p => p.services.some(s => s.line_id === "national-rail"));
    expect(shared).toBeDefined();
    expect(catalogue.stations.every(s => s.platforms.every(p => p.is_customer_facing && p.services.some(v => v.line_id !== "national-rail")))).toBe(true);
    expect(catalogue.counts.full).toEqual({ stations: 509, platforms: 1584, services: 1878 });
  });
});

it("records full and filtered counts separately, including shared NR relationships", () => {
  expect(catalogue.counts.app).toEqual({ stations: 460, platforms: 1235, services: 1528 });
  const original = source.stations.filter(s => s.platforms.every(p => p.services.every(v => v.line_id === "national-rail")));
  expect(original.length).toBeGreaterThan(0);
  expect(original.every(s => !catalogue.stationsById.has(s.station_id))).toBe(true);
  expect(source.stations.flatMap(s => s.platforms).filter(p => !p.is_customer_facing).every(p => !catalogue.platformsById.has(p.platform_id))).toBe(true);
});

it("searches canonical names, punctuation and aliases deterministically offline", () => {
  expect(searchCatalogue("KINGS-CROSS").stations[0]?.station_id).toBe("HUBKGX");
  expect(searchCatalogue("bAtTeRsEa").stations[0]?.station_name).toBe("Battersea Power Station");
  expect(searchCatalogue("Abbey Wood").stations[0]?.station_id).toBe("HUBABW");
  expect(searchCatalogue("Kew Gardens").stations[0]?.platforms).toHaveLength(2);
  expect(searchCatalogue("zzzzno-station")).toEqual({ state: "no-match", stations: [] });
  expect(searchCatalogue(" -- ").state).toBe("empty-query");
  expect(searchCatalogue("Kew", null)).toEqual({ state: "missing-catalogue", stations: [] });
  expect(searchCatalogue("west")).toEqual(searchCatalogue("west"));
});

it("indexes canonical/legacy station IDs and each service stop-area without flattening platforms", () => {
  expect(catalogue.stationsByAnyId.get("940GZZLUEUS")?.station_id).toBe("HUBEUS");
  const district = catalogue.servicesByStopArea.get("940GZZLUKWG");
  const mildmay = catalogue.servicesByStopArea.get("910GKEWGRDN");
  expect(district).toHaveLength(2);
  expect(mildmay).toHaveLength(2);
  expect(district?.every(record => record.station.station_id === "HUBKWG" && record.service.line_id === "district")).toBe(true);
  expect(mildmay?.every(record => record.service.line_id === "mildmay")).toBe(true);
  expect(catalogue.stations.flatMap(s => s.platforms).some(p => !p.platform_number && p.services.some(s => s.line_id === "tram"))).toBe(true);
  expect(catalogue.stations.flatMap(s => s.platforms).some(p => !p.cardinal_direction)).toBe(true);
  expect(catalogue.stations.flatMap(s => s.platforms).some(p => p.cardinal_direction === "Westbound")).toBe(true);
});

it.each([
  ["duplicate station", (d: typeof source) => { d.stations[1].station_id = d.stations[0].station_id; }],
  ["duplicate platform", (d: typeof source) => { d.stations[0].platforms[1].platform_id = d.stations[0].platforms[0].platform_id; }],
  ["unknown line", (d: typeof source) => { d.stations[0].platforms[0].services[0].line_id = "invented"; }],
  ["wrong mode", (d: typeof source) => { d.stations[0].platforms[0].services[0].mode = "bus"; }],
  ["missing hierarchy", (d: typeof source) => { d.stations[0].platforms.pop(); }],
  ["wrong counts", (d: typeof source) => { d.metadata.platform_count++; }],
  ["invalid provenance", (d: typeof source) => { d.metadata.source_sha256 = "unknown"; }],
  ["invalid source URL", (d: typeof source) => { d.metadata.source_url = "https://example.com/archive.zip"; }],
  ["invalid retrieval date", (d: typeof source) => { d.metadata.retrieved_on = "2026-02-30"; }],
  ["source date after retrieval", (d: typeof source) => { d.metadata.archive_internal_file_date = "2026-11-11"; }],
  ["unknown source field", (d: typeof source) => { Object.assign(d.stations[0], { invented: "value" }); }],
  ["invalid direction", (d: typeof source) => { d.stations[0].platforms[0].cardinal_direction = "up"; }],
  ["wrong boolean", (d: typeof source) => { Object.assign(d.stations[0].platforms[0], { is_customer_facing: "TRUE" }); }],
  ["duplicate service", (d: typeof source) => { d.stations[0].platforms[0].services.push(d.stations[0].platforms[0].services[0]); }],
])("rejects malformed source %s", (_name, mutate) => {
  const invalid = structuredClone(source);
  mutate(invalid);
  expect(() => validateSnapshot(invalid)).toThrow();
});

it("retains legitimate blank strings without inferring unknown data from IDs", () => {
  const rebuilt = createCatalogue(source);
  const camden = rebuilt.stationsById.get("940GZZLUCTN")!;
  expect(camden.platforms.filter(p => p.cardinal_direction === "Southbound").every(p => p.services.every(s => s.direction_towards === ""))).toBe(true);
  expect(rebuilt.platformsById.get("940GZZLUWCY-Plat02-central")?.cardinal_direction).toBe("");
});
