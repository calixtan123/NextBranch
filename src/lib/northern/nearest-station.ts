/** Browser-local distance and deterministic nearest Northern station selection. */
import type { NorthernStationCoordinate } from "./station-coordinates";

export type GeographicPoint = Readonly<{ latitude: number; longitude: number }>;
export type NearestStationResult = Readonly<{
  nearest: NorthernStationCoordinate;
  nearestDistanceMetres: number;
  secondNearest: NorthernStationCoordinate | null;
  secondNearestDistanceMetres: number | null;
}>;

const EARTH_RADIUS_METRES = 6_371_008.8;
const degreesToRadians = (degrees: number) => degrees * Math.PI / 180;

/**
 * Returns the great-circle distance between two latitude/longitude points.
 *
 * Parameters
 * ----------
 * from : GeographicPoint
 *     The first latitude/longitude point.
 * to : GeographicPoint
 *     The second latitude/longitude point.
 *
 * Returns
 * -------
 * number
 *     The Haversine great-circle distance in metres.
 */
export function haversineDistanceMetres(from: GeographicPoint, to: GeographicPoint): number {
  const latitudeDifference = degreesToRadians(to.latitude - from.latitude);
  const longitudeDifference = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const halfChord = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(halfChord));
}

/**
 * Ranks station coordinates by distance, resolving equal distances by canonical ID.
 *
 * Parameters
 * ----------
 * position : GeographicPoint
 *     The browser-local point from which station distances are measured.
 * stations : readonly NorthernStationCoordinate[]
 *     Reviewed canonical station coordinates to rank.
 *
 * Returns
 * -------
 * NearestStationResult
 *     The nearest and optional second-nearest station with distances in metres.
 *
 * Raises
 * ------
 * Error
 *     If no station coordinate is provided.
 */
export function findNearestStations(
  position: GeographicPoint,
  stations: readonly NorthernStationCoordinate[],
): NearestStationResult {
  const ranked = stations.map((station) => ({ station, distanceMetres: haversineDistanceMetres(position, station) }))
    .toSorted((left, right) => left.distanceMetres - right.distanceMetres || left.station.id.localeCompare(right.station.id));
  const nearest = ranked[0];
  if (!nearest) throw new Error("At least one Northern station coordinate is required");
  const secondNearest = ranked[1] ?? null;
  return {
    nearest: nearest.station,
    nearestDistanceMetres: nearest.distanceMetres,
    secondNearest: secondNearest?.station ?? null,
    secondNearestDistanceMetres: secondNearest?.distanceMetres ?? null,
  };
}
