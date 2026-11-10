/** Evidenced feed and physical-platform matching, independent of live availability. */
import { z } from "zod";
import type { Train } from "../northern/predictions";
import type { AppStation } from "./index";
import type { CataloguePlatform, CatalogueService } from "./schema";

export type Capability = "supported" | "unsupported" | "unverified";
export const capabilitySchema = z.object({
  feed: z.enum(["supported", "unsupported", "unverified"]),
  mapping: z.enum(["supported", "unsupported", "unverified"]),
  evidence: z.string(),
});
export const catalogueResponseSchema = z.object({
  stationId: z.string(),
  liveState: z.enum(["available", "empty", "unverified", "unavailable"]),
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
 *     Platform whose number/cardinal pair must be unique within the service.
 * service : CatalogueService
 *     Published line and stop-area relationship to assess.
 *
 * Returns
 * -------
 * object
 *     Immutable feed/mapping capability and its evidence statement.
 */
export function serviceCapability(station: AppStation, platform: CataloguePlatform, service: CatalogueService): z.infer<typeof capabilitySchema> {
  if (service.line_id === "national-rail") return { feed: "unsupported", mapping: "unsupported", evidence: "National Rail live integration is outside this delivery." };
  if (service.line_id !== "northern" || !service.stop_area_naptan_code) return { feed: "unverified", mapping: "unverified", evidence: "Live feed and platform mapping require mode-specific verification." };
  const unique = station.platforms.filter(candidate =>
    candidate.platform_number === platform.platform_number &&
    candidate.cardinal_direction === platform.cardinal_direction &&
    candidate.services.some(s => s.line_id === "northern" && s.stop_area_naptan_code === service.stop_area_naptan_code),
  ).length === 1;
  const verified = Boolean(platform.platform_number) && ["Northbound", "Southbound"].includes(platform.cardinal_direction) && unique;
  return {
    feed: "supported", mapping: verified ? "supported" : "unverified",
    evidence: verified
      ? "Official station archive platform number + cardinal direction, matched to the exact Northern live platform label. Duplicate platform NaPTAN is not used."
      : "Northern arrivals supported, physical-platform number/direction mapping is ambiguous or incomplete.",
  };
}

/**
 * Resolves a unique exact published number/cardinal pair.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station containing eligible physical platforms.
 * train : Train
 *     Existing Northern normalizer output with platform confidence retained.
 *
 * Returns
 * -------
 * string or null
 *     Canonical physical ID when uniquely evidenced, otherwise null.
 */
export function physicalPlatformForTrain(station: AppStation, train: Train): string | null {
  if (!train.platformConfirmed) return null;
  const matches = station.platforms.filter(platform =>
    platform.platform_number === train.platform && platform.cardinal_direction === train.direction &&
    platform.services.some(service => service.line_id === train.lineId && serviceCapability(station, platform, service).mapping === "supported"),
  );
  return matches.length === 1 ? matches[0]!.platform_id : null;
}

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
