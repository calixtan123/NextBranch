import { NextResponse } from "next/server";
import { groupDepartures, type Departure } from "@/lib/departure-view";
import { byId } from "@/lib/northern/stations";
import { normalizePredictions, type Train } from "@/lib/northern/predictions";
import type { Arrival } from "@/lib/northern/schemas";
import { getArrivals, TflError } from "@/lib/tfl/client";
import { allowAllRateLimit, RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS, type RateLimitAdapter } from "@/lib/rate-limit";

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
  return station && byId.has(station) ? station : null;
}

function toDeparture(train: Train): Departure {
  return {
    id: train.id,
    destinationName: train.destinationName,
    expectedArrival: train.expectedArrival,
    secondsToStation: train.secondsToOrigin,
    platform: train.platformConfirmed ? train.platform : null,
    direction: train.direction,
    towards: train.towards,
  };
}

/** Creates a cache-free departure handler; dependencies are injectable for deterministic tests. */
export function createDeparturesHandler(deps: DeparturesDependencies = live) {
  return async (request: Request): Promise<NextResponse> => {
    const rateLimit = deps.rateLimit ?? allowAllRateLimit;
    if (!(await rateLimit(request)).allowed)
      return response(RATE_LIMIT_RESPONSE, 429, { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) });
    const stationId = requestedStation(request);
    if (!stationId) return response({ error: "INVALID_STATION" }, 400);
    const station = byId.get(stationId);
    if (!station) return response({ error: "INVALID_STATION" }, 400);
    const now = deps.now();
    let arrivals: Arrival[];
    try {
      arrivals = await deps.arrivals(stationId);
    } catch (error) {
      const configuration = error instanceof TflError && error.code === "config";
      return response(
        { error: configuration ? "CONFIGURATION_ERROR" : "TFL_UNAVAILABLE" },
        configuration ? 500 : 503,
      );
    }
    const current = normalizePredictions(
      arrivals.filter((arrival) => arrival.naptanId === stationId),
      now,
    );
    const timestamps = current
      .map((train) => train.timestamp)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .toSorted((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return response({
      station: { id: station.id, name: station.name },
      observedAt: now.toISOString(),
      newestPredictionGeneratedAt: timestamps[0] ?? null,
      refreshAfterSeconds: 30,
      platforms: groupDepartures(current.map(toDeparture)),
    });
  };
}

export const GET = createDeparturesHandler();
