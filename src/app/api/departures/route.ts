/** Serves compatible Northern departures and offline passenger-platform metadata. */
import { NextResponse } from "next/server";
import { groupDepartures, type Departure } from "@/lib/departure-view";
import { catalogue } from "@/lib/catalogue";
import { byId } from "@/lib/northern/stations";
import { catalogueMetadata, northernStopAreas, physicalPlatformForTrain } from "@/lib/catalogue/capability";
import { normalizePredictions, type Train } from "@/lib/northern/predictions";
import type { Arrival } from "@/lib/northern/schemas";
import { getArrivals, TflError } from "@/lib/tfl/client";
import { allowAllRateLimit, type RateLimitAdapter } from "@/lib/rate-limit-server";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";

export const dynamic = "force-dynamic";
export type DeparturesDependencies = {
  arrivals: (station: string) => Promise<Arrival[]>;
  now: () => Date;
  rateLimit?: RateLimitAdapter;
};
const live: DeparturesDependencies = { arrivals: getArrivals, now: () => new Date() };
const headers = { "Cache-Control": "no-store" };
const response = (body: object, status = 200, additionalHeaders: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...headers, ...additionalHeaders } });

function requestedStation(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  const values = params.getAll("station");
  if (params.size !== 1 || values.length !== 1) return null;
  const station = values[0];
  return station && catalogue.stationsByAnyId.has(station) ? station : null;
}

function toDeparture(train: Train, physicalPlatformId: string | null): Departure {
  return {
    id: train.id,
    lineId: train.lineId,
    physicalPlatformId,
    destinationName: train.destinationName,
    expectedArrival: train.expectedArrival,
    secondsToStation: train.secondsToOrigin,
    platform: train.platformConfirmed ? train.platform : null,
    direction: train.direction,
    towards: train.towards,
  };
}

/**
 * Creates a cache-free handler with injectable transport, clock and rate limiter.
 *
 * Parameters
 * ----------
 * deps : DeparturesDependencies, optional
 *     Existing server transport and request dependencies.
 *
 * Returns
 * -------
 * function
 *     Compatible departures handler with additive catalogue metadata.
 */
export function createDeparturesHandler(deps: DeparturesDependencies = live) {
  return async (request: Request): Promise<NextResponse> => {
    const rateLimit = deps.rateLimit ?? allowAllRateLimit;
    if (!(await rateLimit(request)).allowed)
      return response(RATE_LIMIT_RESPONSE, 429, { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) });
    const stationId = requestedStation(request);
    if (!stationId) return response({ error: "INVALID_STATION" }, 400);
    const station = catalogue.stationsByAnyId.get(stationId);
    if (!station) return response({ error: "INVALID_STATION" }, 400);
    const now = deps.now();
    const stopAreas = northernStopAreas(station);
    let arrivals: Arrival[];
    try {
      arrivals = (await Promise.all(stopAreas.map(stop => deps.arrivals(stop)))).flat();
    } catch (error) {
      const configuration = error instanceof TflError && error.code === "config";
      return response(
        { error: configuration ? "CONFIGURATION_ERROR" : "TFL_UNAVAILABLE", catalogue: catalogueMetadata(station, "unavailable") },
        configuration ? 500 : 503,
      );
    }
    const current = normalizePredictions(
      arrivals.filter((arrival) => stopAreas.includes(arrival.naptanId)),
      now,
    );
    const timestamps = current
      .map((train) => train.timestamp)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .toSorted((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return response({
      station: { id: stationId, name: byId.get(stationId)?.name ?? station.station_name },
      catalogue: catalogueMetadata(station, stopAreas.length ? (current.length ? "available" : "empty") : "unverified"),
      observedAt: now.toISOString(),
      newestPredictionGeneratedAt: timestamps[0] ?? null,
      refreshAfterSeconds: 30,
      platforms: groupDepartures(current.map(train => toDeparture(train, physicalPlatformForTrain(station, train)))),
    });
  };
}

export const GET = createDeparturesHandler();
