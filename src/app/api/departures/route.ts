/** Serves line-specific verified rail departures and offline passenger-platform metadata. */
import { NextResponse } from "next/server";
import { groupDepartures, type Departure } from "@/lib/departure-view";
import { catalogue } from "@/lib/catalogue";
import { byId } from "@/lib/northern/stations";
import { catalogueMetadata, departureFeeds, physicalPlatformForTrain } from "@/lib/catalogue/capability";
import { normalizeRailPredictions, type RailDeparture } from "@/lib/rail/departures";
import type { Arrival } from "@/lib/northern/schemas";
import { getLineArrivalsFeed, TflError, type ArrivalsFeed } from "@/lib/tfl/client";
import { checkRateLimit, type RateLimitAdapter } from "@/lib/rate-limit-server";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";

export const dynamic = "force-dynamic";
export type DeparturesDependencies = {
  arrivals?: (station: string) => Promise<Arrival[]>;
  lineArrivals?: (lineId: string, stopAreaId: string) => Promise<Arrival[]>;
  lineArrivalsFeed?: (lineId: string, stopAreaId: string) => Promise<ArrivalsFeed>;
  now: () => Date;
  rateLimit?: RateLimitAdapter;
};
const live: DeparturesDependencies = { lineArrivalsFeed: getLineArrivalsFeed, now: () => new Date() };
const headers = { "Cache-Control": "no-store" };
const response = (body: object, status = 200, additionalHeaders: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...headers, ...additionalHeaders } });

function requestedStation(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  const values = params.getAll("station");
  if (params.size !== 1 || values.length !== 1) return null;
  const station = values[0];
  return station && catalogue.stationsByAnyId.has(station) ? station : null;
}

function toDeparture(train: RailDeparture, physicalPlatformId: string | null): Departure {
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
 * Creates a no-store response handler with injectable feed transport and clock.
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
    const decision = await checkRateLimit(request, deps.rateLimit);
    if (!decision) return response({ error: "PROTECTION_UNAVAILABLE" }, 503);
    if (!decision.allowed)
      return response(RATE_LIMIT_RESPONSE, 429, { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) });
    const stationId = requestedStation(request);
    if (!stationId) return response({ error: "INVALID_STATION" }, 400);
    const station = catalogue.stationsByAnyId.get(stationId);
    if (!station) return response({ error: "INVALID_STATION" }, 400);
    const feeds = departureFeeds(station);
    const results = await Promise.allSettled(feeds.map(async feed => {
      if (deps.lineArrivalsFeed) return deps.lineArrivalsFeed(feed.lineId, feed.stopAreaId);
      if (!deps.lineArrivals && !deps.arrivals) return getLineArrivalsFeed(feed.lineId, feed.stopAreaId);
      const arrivals = await (deps.lineArrivals
        ? deps.lineArrivals(feed.lineId, feed.stopAreaId)
        : deps.arrivals!(feed.stopAreaId));
      // Legacy injected transports expose only records, so timestamp completion.
      return { arrivals, fetchedAt: deps.now().toISOString() };
    }));
    const now = deps.now();
    const exactRecords = results.map((result, index) => result.status === "fulfilled"
      ? result.value.arrivals.filter(arrival => arrival.lineId === feeds[index]!.lineId && arrival.naptanId === feeds[index]!.stopAreaId)
      : []);
    const currentByFeed = exactRecords.map(records => normalizeRailPredictions(records, now));
    const current = currentByFeed.flat();
    const states = results.map((result, index) => ({
      ...feeds[index]!,
      ...(result.status === "fulfilled" ? { fetchedAt: result.value.fetchedAt } : {}),
      liveState: result.status === "rejected" ? "unavailable" as const
        : currentByFeed[index]!.length ? "available" as const : "empty" as const,
      ...(!currentByFeed[index]!.length && exactRecords[index]!.length ? { freshness: "stale" as const } : {}),
    }));
    const failures = results.filter(result => result.status === "rejected");
    if (feeds.length && failures.length === feeds.length) {
      const configuration = failures.some(result => result.reason instanceof TflError && result.reason.code === "config");
      return response(
        { error: configuration ? "CONFIGURATION_ERROR" : "TFL_UNAVAILABLE", catalogue: { ...catalogueMetadata(station, "unavailable"), feeds: states } },
        configuration ? 500 : 503,
      );
    }
    const timestamps = current
      .map((train) => train.timestamp)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .toSorted((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const fetchedTimes = results.flatMap(result => result.status === "fulfilled" ? [Date.parse(result.value.fetchedAt)] : []);
    return response({
      station: { id: stationId, name: byId.get(stationId)?.name ?? station.station_name },
      catalogue: { ...catalogueMetadata(station, !feeds.length ? "unverified" : failures.length ? "partial"
        : current.length ? "available" : "empty"), feeds: states },
      observedAt: new Date(fetchedTimes.length ? Math.min(...fetchedTimes) : now.getTime()).toISOString(),
      generatedAt: deps.now().toISOString(),
      newestPredictionGeneratedAt: timestamps[0] ?? null,
      refreshAfterSeconds: 30,
      platforms: groupDepartures(current.map(train => {
        const physicalPlatformId = physicalPlatformForTrain(station, train);
        const platform = station.platforms.find(candidate => candidate.platform_id === physicalPlatformId);
        // Published direction is display metadata only after exact physical matching.
        return toDeparture({ ...train, direction: platform?.cardinal_direction || train.direction }, physicalPlatformId);
      })),
    });
  };
}

export const GET = createDeparturesHandler();
