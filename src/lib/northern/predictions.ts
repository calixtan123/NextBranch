import { dedupe, identity } from "./identity";
import { platformInfo, routeBranch } from "./route";
import type { Arrival } from "./schemas";
import { DEPARTED_GRACE, MAX_AGE, MAX_FUTURE_SKEW, secondsToOrigin } from "./time";
export type EtaEvidence = "live" | "estimate" | "unavailable";
export type Train = {
  id: string;
  vehicleId: string | null;
  lineId: "northern";
  canonicalTerminus: string | null;
  destinationName: string | null;
  expectedArrival: string;
  timestamp: string | null;
  secondsToOrigin: number;
  platform: string | null;
  direction: "Northbound" | "Southbound" | null;
  platformConfirmed: boolean;
  branch: string | null;
  towards: string | null;
  routeConfidence: "confirmed" | "inferred" | "unknown";
  servicePatternId: string | null;
  destinationArrival: string | null;
  destinationSeconds: number | null;
  evidence: EtaEvidence;
  strength: EtaEvidence;
  via: string | null;
};
/** Drops stale/departed records after schema validation and retains only domain fields. */
export function normalizePredictions(
  items: readonly Arrival[],
  now = new Date(),
): Train[] {
  return dedupe(items).flatMap((prediction) => {
    if (prediction.lineId !== "northern") return [];
    const seconds = secondsToOrigin(prediction.expectedArrival, now);
    const age = prediction.timestamp
      ? secondsToOrigin(prediction.timestamp, now)
      : 0;
    if (
      !Number.isFinite(seconds) ||
      !Number.isFinite(age) ||
      seconds < -DEPARTED_GRACE ||
      age < -MAX_AGE ||
      age > MAX_FUTURE_SKEW
    )
      return [];
    const platform = platformInfo(
      prediction.platformName,
      prediction.direction,
    );
    return [
      {
        id: identity(prediction),
        vehicleId: prediction.vehicleId?.trim() || null,
        lineId: "northern" as const,
        canonicalTerminus: prediction.destinationNaptanId ?? null,
        destinationName: prediction.destinationName ?? null,
        expectedArrival: prediction.expectedArrival,
        timestamp: prediction.timestamp ?? null,
        secondsToOrigin: seconds,
        platform: platform.platform,
        direction: platform.direction,
        platformConfirmed: platform.confirmed,
        branch: routeBranch(prediction.towards),
        towards: prediction.towards ?? null,
        routeConfidence: "unknown" as const,
        servicePatternId: null,
        destinationArrival: null,
        destinationSeconds: null,
        evidence: "unavailable" as const,
        strength: "unavailable" as const,
        via: null,
      },
    ];
  });
}
export type RuntimeWindow = { minutes: number } | null;
/** Matches a unique downstream snapshot; snapshot timestamps, not arrival times, have 90s skew. */
export function liveDestinationEta(
  origin: Train,
  downstream: readonly Train[],
  now = new Date(),
  scheduled: RuntimeWindow = null,
): { arrival: string; seconds: number } | null {
  const originTimestamp = origin.timestamp;
  if (
    !origin.vehicleId ||
    !origin.canonicalTerminus ||
    originTimestamp === null ||
    scheduled === null ||
    !Number.isFinite(scheduled.minutes) ||
    scheduled.minutes <= 0
  )
    return null;
  const originExpected = new Date(origin.expectedArrival).getTime();
  const originObserved = new Date(originTimestamp).getTime();
  if (!Number.isFinite(originExpected) || !Number.isFinite(originObserved))
    return null;
  const matches = downstream.filter((candidate) => {
    const timestamp = candidate.timestamp;
    const candidateExpected = new Date(candidate.expectedArrival).getTime();
    const candidateObserved = timestamp
      ? new Date(timestamp).getTime()
      : Number.NaN;
    return (
      candidate.lineId === "northern" &&
      candidate.vehicleId === origin.vehicleId &&
      candidate.canonicalTerminus === origin.canonicalTerminus &&
      ((candidate.branch === null && origin.branch === null) ||
        candidate.branch === origin.branch) &&
      timestamp !== null &&
      Number.isFinite(candidateExpected) &&
      Number.isFinite(candidateObserved) &&
      Math.abs(
        candidateObserved - originObserved,
      ) <= 90_000
    );
  });
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const runtime = (new Date(match.expectedArrival).getTime() - originExpected) / 60_000;
  if (
    runtime <= 0 ||
    runtime < scheduled.minutes - 5 || runtime > scheduled.minutes + 20
  )
    return null;
  return {
    arrival: match.expectedArrival,
    seconds: secondsToOrigin(match.expectedArrival, now),
  };
}
export function mapPredictions(
  items: readonly Arrival[],
  _destinationId: string,
  now = new Date(),
): Train[] {
  return normalizePredictions(items, now);
}
