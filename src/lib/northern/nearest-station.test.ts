/** Verifies Haversine distance and deterministic canonical station ranking. */

import { describe, expect, it } from "vitest";
import { findNearestStations, haversineDistanceMetres } from "./nearest-station";

describe("nearest Northern station calculations", () => {
  // Break: latitude/longitude degrees are treated as metres or the earth-distance formula is incorrect.
  it("returns the hand-checked London-to-Paris great-circle distance in metres", () => {
    expect(haversineDistanceMetres(
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 48.8566, longitude: 2.3522 },
    )).toBeCloseTo(343_556, -3);
  });

  // Break: equal distances depend on source order rather than canonical station identity.
  it("uses canonical station IDs to break equal-distance ties deterministically", () => {
    const result = findNearestStations(
      { latitude: 0, longitude: 0 },
      [
        { id: "station-b", latitude: 0, longitude: 1 },
        { id: "station-a", latitude: 0, longitude: -1 },
        { id: "station-c", latitude: 3, longitude: 0 },
      ],
    );

    expect(result.nearest.id).toBe("station-a");
    expect(result.secondNearest?.id).toBe("station-b");
  });
});
