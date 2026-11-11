/** Offline passenger catalogue and deterministic station/platform/service indexes. */
import snapshot from "../../../data/tfl-station-platform-inventory/tfl-station-platform-lines.json";
import { normalize, stations as northernStations } from "../northern/stations";
import { validateSnapshot, type CataloguePlatform, type CatalogueStation } from "./schema";

export type AppStation = CatalogueStation & { aliases: readonly string[] };
export type Catalogue = ReturnType<typeof createCatalogue>;

/**
 * Determines passenger eligibility from published services.
 *
 * Parameters
 * ----------
 * platform : CataloguePlatform
 *     Source physical platform with all published service relationships.
 *
 * Returns
 * -------
 * boolean
 *     Whether a customer-facing platform has an in-scope TfL service.
 */
export function isEligiblePlatform(platform: CataloguePlatform): boolean {
  return platform.is_customer_facing && platform.services.some(service => service.line_id !== "national-rail");
}

/**
 * Validates the full snapshot and builds passenger-only indexes.
 *
 * Parameters
 * ----------
 * value : unknown
 *     Complete source snapshot before passenger filtering.
 *
 * Returns
 * -------
 * Catalogue
 *     Eligible hierarchy, canonical and unambiguous alias indexes, and counts.
 *
 * Raises
 * ------
 * Error
 *     If the source snapshot fails shared validation.
 */
export function createCatalogue(value: unknown) {
  const full = validateSnapshot(value);
  const stations: AppStation[] = full.stations.flatMap(station => {
    const platforms = station.platforms.filter(isEligiblePlatform);
    if (!platforms.length) return [];
    const northernIds = new Set(platforms.flatMap(p => p.services.filter(s => s.line_id === "northern").map(s => s.stop_area_naptan_code)));
    const aliases = northernStations.filter(s => northernIds.has(s.id)).flatMap(s => [s.name, ...s.aliases]);
    return [{ ...station, platforms, aliases: [...new Set(aliases)] }];
  }).sort((a, b) => a.station_name.localeCompare(b.station_name, "en-GB") || a.station_id.localeCompare(b.station_id));
  const stationsById = new Map(stations.map(station => [station.station_id, station]));
  const platformsById = new Map(stations.flatMap(station => station.platforms.map(platform => [platform.platform_id, platform] as const)));
  const servicesByStopArea = new Map<string, { station: AppStation; platform: CataloguePlatform; service: CataloguePlatform["services"][number] }[]>();
  const idCandidates = new Map<string, Set<AppStation>>();
  for (const station of stations) {
    for (const platform of station.platforms) {
      for (const service of platform.services) {
        const stop = service.stop_area_naptan_code;
        if (!stop) continue;
        const candidates = idCandidates.get(stop) ?? new Set<AppStation>();
        candidates.add(station);
        idCandidates.set(stop, candidates);
        const records = servicesByStopArea.get(stop) ?? [];
        records.push({ station, platform, service });
        servicesByStopArea.set(stop, records);
      }
    }
  }
  const stationsByAnyId = new Map(stationsById);
  for (const [id, candidates] of idCandidates) {
    if (candidates.size === 1 && !stationsByAnyId.has(id)) stationsByAnyId.set(id, [...candidates][0]!);
  }
  return {
    stations, stationsById, stationsByAnyId, platformsById, servicesByStopArea,
    metadata: full.metadata,
    counts: {
      full: { stations: full.stations.length, platforms: full.metadata.platform_count, services: full.metadata.platform_service_count },
      app: { stations: stations.length, platforms: platformsById.size, services: stations.flatMap(s => s.platforms).reduce((count, p) => count + p.services.length, 0) },
    },
  };
}

export const catalogue = createCatalogue(snapshot);

/**
 * Searches canonical names and reviewed aliases offline.
 *
 * Parameters
 * ----------
 * query : string
 *     Station name or reviewed alias, normalized for case and punctuation.
 * source : Catalogue or null, optional
 *     Catalogue to search. Null represents an unavailable bundled catalogue.
 *
 * Returns
 * -------
 * object
 *     Explicit search state and deterministically ordered eligible stations.
 */
export function searchCatalogue(query: string, source: Catalogue | null = catalogue): {
  state: "ready" | "empty-query" | "no-match" | "missing-catalogue";
  stations: readonly AppStation[];
} {
  if (!source) return { state: "missing-catalogue", stations: [] };
  const term = normalize(query);
  if (!term) return { state: "empty-query", stations: source.stations };
  const names = (station: AppStation) => [station.station_name, ...station.aliases].map(normalize);
  const stations = source.stations.filter(station => names(station).some(name => name.includes(term)))
    .sort((a, b) => Number(!names(a).some(name => name.startsWith(term))) - Number(!names(b).some(name => name.startsWith(term))) || a.station_name.localeCompare(b.station_name, "en-GB") || a.station_id.localeCompare(b.station_id));
  return { state: stations.length ? "ready" : "no-match", stations };
}
