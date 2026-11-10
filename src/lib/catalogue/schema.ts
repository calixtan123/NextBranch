/** Validates the complete published inventory before any passenger filtering. */
import { z } from "zod";

export const lines = {
  bakerloo: ["Bakerloo", "tube"], central: ["Central", "tube"],
  circle: ["Circle", "tube"], district: ["District", "tube"],
  "hammersmith-city": ["Hammersmith & City", "tube"], jubilee: ["Jubilee", "tube"],
  metropolitan: ["Metropolitan", "tube"], northern: ["Northern", "tube"],
  piccadilly: ["Piccadilly", "tube"], victoria: ["Victoria", "tube"],
  "waterloo-city": ["Waterloo & City", "tube"], dlr: ["DLR", "dlr"],
  elizabeth: ["Elizabeth line", "elizabeth-line"], tram: ["Tram", "tram"],
  liberty: ["Liberty", "overground"], lioness: ["Lioness", "overground"],
  mildmay: ["Mildmay", "overground"], suffragette: ["Suffragette", "overground"],
  weaver: ["Weaver", "overground"], windrush: ["Windrush", "overground"],
  "london-cable-car": ["London Cable Car", "cableCar"],
  "national-rail": ["National Rail", "nationalRail"],
} as const;
export const SOURCE_URL = "https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip";
export const SPECIFICATION_URL = "https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf";
const id = z.string().min(1).refine(value => value.trim() === value, "Identifier contains surrounding whitespace");
const date = z.iso.date();
const serviceSchema = z.object({
  line_id: id, line_name: id, mode: id,
  direction_towards: z.string(), stop_area_naptan_code: z.string(),
}).strict();
const platformSchema = z.object({
  platform_id: id, platform_number: z.string(), friendly_name: z.string(),
  cardinal_direction: z.enum(["", "Northbound", "Southbound", "Eastbound", "Westbound"]),
  platform_naptan_code: z.string(), is_customer_facing: z.boolean(),
  services: z.array(serviceSchema),
}).strict();
const stationSchema = z.object({
  station_id: id, station_name: id, fare_zones: z.string(), hub_naptan_code: z.string(),
  platforms: z.array(platformSchema),
}).strict();
const snapshotSchema = z.object({
  metadata: z.object({
    source_url: z.literal(SOURCE_URL), specification_url: z.literal(SPECIFICATION_URL),
    retrieved_on: date, archive_internal_file_date: date,
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    station_count: z.number().int().nonnegative(), platform_count: z.number().int().nonnegative(),
    platform_service_count: z.number().int().nonnegative(),
    blank_platform_number_count: z.number().int().nonnegative(),
    non_customer_facing_platform_count: z.number().int().nonnegative(), scope: id,
  }).strict(),
  stations: z.array(stationSchema),
}).strict();
export type CatalogueService = z.infer<typeof serviceSchema>;
export type CataloguePlatform = z.infer<typeof platformSchema>;
export type CatalogueStation = z.infer<typeof stationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * Validates source values, unique hierarchy identities, known lines and totals.
 *
 * Parameters
 * ----------
 * value : unknown
 *     Complete source snapshot, including platforms excluded from the app.
 *
 * Returns
 * -------
 * Snapshot
 *     Validated hierarchy, preserving legitimate empty source strings.
 *
 * Raises
 * ------
 * Error
 *     If provenance, identity, service references or declared counts disagree.
 */
export function validateSnapshot(value: unknown): Snapshot {
  const snapshot = snapshotSchema.parse(value);
  const stations = new Set<string>();
  const platforms = new Set<string>();
  let services = 0;
  let blanks = 0;
  let nonCustomer = 0;
  for (const station of snapshot.stations) {
    if (stations.has(station.station_id)) throw new Error(`Duplicate station ID ${station.station_id}`);
    stations.add(station.station_id);
    for (const platform of station.platforms) {
      if (platforms.has(platform.platform_id)) throw new Error(`Duplicate platform ID ${platform.platform_id}`);
      platforms.add(platform.platform_id);
      if (!platform.platform_number) blanks++;
      if (!platform.is_customer_facing) nonCustomer++;
      const relationships = new Set<string>();
      for (const service of platform.services) {
        const definition = lines[service.line_id as keyof typeof lines];
        if (!definition || definition[0] !== service.line_name || definition[1] !== service.mode)
          throw new Error(`Unknown or inconsistent line reference ${service.line_id}`);
        const key = JSON.stringify(service);
        if (relationships.has(key)) throw new Error(`Duplicate service on ${platform.platform_id}`);
        relationships.add(key);
        services++;
      }
    }
  }
  const actual = [stations.size, platforms.size, services, blanks, nonCustomer];
  const m = snapshot.metadata;
  const declared = [m.station_count, m.platform_count, m.platform_service_count, m.blank_platform_number_count, m.non_customer_facing_platform_count];
  if (actual.some((count, index) => count !== declared[index])) throw new Error("Snapshot counts disagree with metadata");
  if (m.archive_internal_file_date > m.retrieved_on) throw new Error("Source date is after retrieval date");
  return snapshot;
}
