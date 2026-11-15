/** Evidenced feed and physical-platform matching, independent of live availability. */
import { z } from "zod";
import type { RailDeparture } from "../rail/departures";
import { numberedRailLines, overgroundLines, railLines, railPlatformInfo } from "../rail/platform";
import evidence from "../../../data/tfl-underground-evidence.json";
import dlrEvidence from "../../../data/tfl-dlr-evidence.json";
import overgroundEvidence from "../../../data/tfl-overground-evidence.json";
import elizabethEvidence from "../../../data/tfl-elizabeth-evidence.json";
import sharedEvidence from "../../../data/tfl-shared-evidence.json";
import tramCableEvidence from "../../../data/tfl-tram-cable-evidence.json";
import type { AppStation } from "./index";
import type { CataloguePlatform, CatalogueService } from "./schema";

// The checked-in official labels establish static capability even during outages.
const observedMappings = new Set([...evidence.feeds, ...dlrEvidence.feeds, ...overgroundEvidence.feeds, ...elizabethEvidence.feeds, ...tramCableEvidence.feeds, ...sharedEvidence.feeds].flatMap(feed => feed.labels.flatMap(label => {
  const parsed = railPlatformInfo(label.lineId, label.platformName);
  return parsed.confirmed ? [JSON.stringify([label.lineId, label.stopAreaId, parsed.platform, parsed.direction])] : [];
})));

export type Capability = "supported" | "unsupported" | "unverified";
export const capabilitySchema = z.object({
  feed: z.enum(["supported", "unsupported", "unverified"]),
  mapping: z.enum(["supported", "unsupported", "unverified"]),
  evidence: z.string(),
});
export const catalogueResponseSchema = z.object({
  stationId: z.string(),
  liveState: z.enum(["available", "empty", "unverified", "unavailable", "partial"]),
  feeds: z.array(z.object({
    lineId: z.string(),
    stopAreaId: z.string(),
    liveState: z.enum(["available", "empty", "unavailable"]),
    freshness: z.literal("stale").optional(),
  })).optional(),
  platforms: z.array(z.object({
    platformId: z.string(), platformNumber: z.string(), description: z.string(),
    direction: z.string(), platformNaptanCode: z.string(),
    services: z.array(z.object({
      lineId: z.string(), lineName: z.string(), mode: z.string(), towards: z.string(),
      stopAreaId: z.string(), capability: capabilitySchema,
    })),
  })),
});

/**
 * Reports reviewed feed and physical-platform mapping capability.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station containing eligible physical platforms.
 * platform : CataloguePlatform
 *     Platform whose published identity must be unique within the exact service.
 *     Tram retains blank-number/cardinal pairs. Underground uses number/cardinal pairs. DLR, Elizabeth and Overground require unique numbers or letters.
 * service : CatalogueService
 *     Published line and stop-area relationship to assess.
 *
 * Returns
 * -------
 * object
 *     Immutable feed/mapping capability and its evidence statement.
 */
export function serviceCapability(station: AppStation, platform: CataloguePlatform, service: CatalogueService): z.infer<typeof capabilitySchema> {
  if (service.line_id === "london-cable-car") return {
    feed: "unverified", mapping: "unverified",
    evidence: "Official London Cable Car line metadata and both physical platforms retained. Official line-wide and both stop arrivals were empty, which does not establish unsupported capability. Live feed and physical matching await verification. Captured 2026-11-10 in data/tfl-tram-cable-evidence.json.",
  };
  if (service.line_id === "national-rail") return { feed: "unsupported", mapping: "unsupported", evidence: "National Rail live integration is outside this delivery." };
  if (!railLines.some(line => line === service.line_id) || !service.stop_area_naptan_code) return { feed: "unverified", mapping: "unverified", evidence: "Live feed and platform mapping require mode-specific verification." };
  const numbered = numberedRailLines.some(line => line === service.line_id);
  const unique = station.platforms.filter(candidate =>
    candidate.platform_number === platform.platform_number &&
    (numbered || candidate.cardinal_direction === platform.cardinal_direction) &&
    candidate.services.some(s => s.line_id === service.line_id && s.stop_area_naptan_code === service.stop_area_naptan_code),
  ).length === 1;
  const observed = observedMappings.has(JSON.stringify([service.line_id, service.stop_area_naptan_code, platform.platform_number, numbered ? null : platform.cardinal_direction]));
  const retainedNorthern = service.line_id === "northern" && ["Northbound", "Southbound"].includes(platform.cardinal_direction);
  const publishedIdentity = Boolean(platform.platform_number) || (service.line_id === "tram" && Boolean(platform.cardinal_direction));
  const verified = publishedIdentity && unique && (observed || retainedNorthern);
  if (service.line_id === "tram") {
    return {
      feed: "supported", mapping: verified ? "supported" : "unverified",
      evidence: verified
        ? "Official station archive unique Tram service stop area + published platform number (including blank) + explicit cardinal direction matched to reviewed official live labels. Captured 2026-11-10 in data/tfl-tram-cable-evidence.json. Blank numbers remain blank. Destinations, API inbound/outbound and historical IDs are not used."
        : "Tram arrivals supported, but this physical service/platform pair has no unique exact reviewed live number/cardinal label. Blank and numbered platforms are kept distinct. Matching awaits verification.",
    };
  }
  if (overgroundLines.some(line => line === service.line_id)) {
    return {
      feed: "supported", mapping: verified ? "supported" : "unverified",
      evidence: verified
        ? "Official station archive unique current Overground service line + stop area + platform number matched to explicit official live labels. Captured 2026-11-10 in data/tfl-overground-evidence.json. Published descriptions are preserved. Historical IDs, destinations and API inbound/outbound are not used for matching."
        : "Overground arrivals supported, but this physical service/platform pair has no unique reviewed live label. Matching awaits verification.",
    };
  }
  if (service.line_id === "elizabeth") {
    return {
      feed: "supported", mapping: verified ? "supported" : "unverified",
      evidence: verified
        ? "Official station archive unique Elizabeth service stop area + platform number or letter matched to explicit official live labels. Captured 2026-11-10 in data/tfl-elizabeth-evidence.json. Published shared National Rail descriptions are preserved. Hub aliases, destinations, API direction and historical IDs are not used for matching."
        : "Elizabeth arrivals supported, but this physical service/platform pair has no unique reviewed live label. Matching awaits verification.",
    };
  }
  if (service.line_id === "dlr") {
    return {
      feed: "supported", mapping: verified ? "supported" : "unverified",
      evidence: verified
        ? "Official station archive unique DLR service stop area + platform number matched to explicit official live labels. Captured 2026-11-10 in data/tfl-dlr-evidence.json. Cardinal direction and published blanks are preserved. Destinations and historical IDs are not used for platform matching."
        : "DLR arrivals supported, but this physical service/platform pair has no unique reviewed live label. Matching awaits verification.",
    };
  }
  return {
    feed: "supported", mapping: verified ? "supported" : "unverified",
    evidence: verified
      ? "Official station archive service stop area + platform number + cardinal direction matched to official Underground live labels. Evidence captured 2026-11-10 in data/tfl-underground-evidence.json and targeted data/tfl-shared-evidence.json. Existing Northern evidence retained. Platform NaPTAN and destinations are not used."
      : "Underground arrivals supported, but this physical service/platform pair has no unambiguous reviewed live label. Matching awaits verification.",
  };
}

/**
 * Resolves a unique exact published service/platform identity.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station containing eligible physical platforms.
 * train : RailDeparture
 *     Line departure retaining service stop area and platform confidence.
 *
 * Returns
 * -------
 * string or null
 *     Canonical physical ID when the explicit live identity matches uniquely,
 *     otherwise null. Static reviewed capability still controls save eligibility.
 */
export function physicalPlatformForTrain(station: AppStation, train: Pick<RailDeparture, "platformConfirmed" | "platform" | "direction" | "lineId"> & { stopAreaId?: string }): string | null {
  const numbered = numberedRailLines.some(line => line === train.lineId);
  if (!train.platformConfirmed || ((numbered || train.lineId === "tram") && !train.stopAreaId)) return null;
  const matches = station.platforms.filter(platform =>
    platform.platform_number === train.platform && (numbered || platform.cardinal_direction === train.direction) &&
    platform.services.some(service => service.line_id === train.lineId && (!train.stopAreaId || service.stop_area_naptan_code === train.stopAreaId) && serviceCapability(station, platform, service).feed === "supported"),
  );
  if (matches.length !== 1) return null;
  const platform = matches[0]!;
  if (numbered && train.direction !== null && platform.cardinal_direction !== train.direction) return null;
  return platform.platform_id;
}

/**
 * Resolves supported rail requests to exact line and service stop-area keys.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Station whose eligible platforms retain their published service stops.
 *
 * Returns
 * -------
 * object[]
 *     Sorted unique line/stop requests. Other modes remain unverified.
 */
export function departureFeeds(station: AppStation): { lineId: string; stopAreaId: string }[] {
  const feeds = new Map<string, { lineId: string; stopAreaId: string }>();
  for (const platform of station.platforms) {
    for (const service of platform.services) {
      if (serviceCapability(station, platform, service).feed !== "supported") continue;
      const feed = { lineId: service.line_id, stopAreaId: service.stop_area_naptan_code };
      feeds.set(JSON.stringify(feed), feed);
    }
  }
  return [...feeds.values()].sort((a, b) => a.lineId.localeCompare(b.lineId) || a.stopAreaId.localeCompare(b.stopAreaId));
}

/** Compatibility alias for existing Underground request consumers. */
export const undergroundFeeds = departureFeeds;

/**
 * Lists distinct Northern stop areas for the existing server transport.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station with published service relationships.
 *
 * Returns
 * -------
 * string[]
 *     Sorted nonblank Northern stop-area IDs, deduplicated across platforms.
 */
export function northernStopAreas(station: AppStation): string[] {
  return [...new Set(station.platforms.flatMap(p => p.services.filter(s => s.line_id === "northern" && s.stop_area_naptan_code).map(s => s.stop_area_naptan_code)))].sort();
}

/**
 * Provides physical-platform descriptions and capability beside live state.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station containing all eligible platforms and shared services.
 * liveState : string
 *     Current availability, independent of immutable service capability.
 *
 * Returns
 * -------
 * object
 *     Additive catalogue response validated by the shared decoder schema.
 */
export function catalogueMetadata(station: AppStation, liveState: z.infer<typeof catalogueResponseSchema>["liveState"]): z.infer<typeof catalogueResponseSchema> {
  return {
    stationId: station.station_id, liveState,
    platforms: station.platforms.map(platform => ({
      platformId: platform.platform_id, platformNumber: platform.platform_number,
      description: platform.friendly_name, direction: platform.cardinal_direction,
      platformNaptanCode: platform.platform_naptan_code,
      services: platform.services.map(service => ({
        lineId: service.line_id, lineName: service.line_name, mode: service.mode,
        towards: service.direction_towards, stopAreaId: service.stop_area_naptan_code,
        capability: serviceCapability(station, platform, service),
      })),
    })),
  };
}
