/** Verified rail station departures with Northern journey normalization retained separately. */
import { identity } from "../northern/identity";
import { normalizePredictions } from "../northern/predictions";
import type { Arrival } from "../northern/schemas";
import { DEPARTED_GRACE, MAX_AGE, MAX_FUTURE_SKEW, remainingSeconds, secondsToOrigin } from "../northern/time";
import { railLines, railPlatformInfo } from "./platform";
import type { CardinalDirection } from "../underground/platform";

export type RailDeparture = {
  id: string; lineId: string; stopAreaId: string; destinationName: string | null;
  expectedArrival: string; timestamp: string | null; secondsToOrigin: number;
  platform: string | null; direction: CardinalDirection | null; platformConfirmed: boolean;
  towards: string | null;
};

/**
 * Normalizes verified rail station departures with feed-scoped identities.
 *
 * Parameters
 * ----------
 * items : Arrival[]
 *     Validated feed records. The caller filters exact requested feeds first.
 * now : Date, optional
 *     Observation clock used by existing freshness and departed rules.
 *
 * Returns
 * -------
 * RailDeparture[]
 *     Current predictions retaining line and stop-area identity. Northern
 *     predictions use the existing journey normalizer and confidence rules.
 */
export function normalizeRailPredictions(items: readonly Arrival[], now = new Date()): RailDeparture[] {
  const seen = new Set<string>();
  return items.flatMap(prediction => {
    if (!railLines.some(line => line === prediction.lineId)) return [];
    // DLR reuses a station-level upstream ID across platforms and arrival times.
    const predictionIdentity = identity(prediction.lineId === "dlr" ? { ...prediction, id: undefined } : prediction);
    const key = `${prediction.lineId}:${prediction.naptanId}:${predictionIdentity}`;
    if (seen.has(key)) return [];
    seen.add(key);
    if (prediction.lineId === "northern") {
      return normalizePredictions([prediction], now).map(train => ({ ...train, stopAreaId: prediction.naptanId }));
    }
    const seconds = remainingSeconds(prediction.expectedArrival, now);
    const age = prediction.timestamp ? secondsToOrigin(prediction.timestamp, now) : 0;
    if (!Number.isFinite(seconds) || !Number.isFinite(age) || seconds < -DEPARTED_GRACE || age < -MAX_AGE || age > MAX_FUTURE_SKEW) return [];
    const platform = railPlatformInfo(prediction.lineId, prediction.platformName);
    return [{
      id: key, lineId: prediction.lineId, stopAreaId: prediction.naptanId,
      destinationName: prediction.destinationName ?? null, expectedArrival: prediction.expectedArrival,
      timestamp: prediction.timestamp ?? null, secondsToOrigin: Math.round(seconds),
      platform: platform.platform, direction: platform.direction, platformConfirmed: platform.confirmed,
      towards: prediction.towards ?? null,
    }];
  });
}
