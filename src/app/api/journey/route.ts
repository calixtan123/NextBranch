import { NextResponse } from "next/server";
import { byId } from "@/lib/northern/stations";
import {
  journeyQuery,
  topologySchema,
  type Arrival,
  type Timetable,
  type Topology,
} from "@/lib/northern/schemas";
import {
  normalizePredictions,
  liveDestinationEta,
  type EtaEvidence,
} from "@/lib/northern/predictions";
import {
  routeCandidates,
  selectSuitable,
  isDirectPair,
  branchLabel,
} from "@/lib/northern/route";
import { rankTrains } from "@/lib/northern/ranking";
import { scheduledRuntime, timetableEta } from "@/lib/northern/eta";
import { bundledTopology } from "@/lib/northern/bundledTopology";
import {
  getArrivals,
  getRoutes,
  getTimetable,
  TflError,
} from "@/lib/tfl/client";
import { allowAllRateLimit, type RateLimitAdapter } from "@/lib/rate-limit-server";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";
import { recordServerDiagnostic } from "@/lib/tfl/diagnostics";
export const dynamic = "force-dynamic";
export type JourneyDependencies = {
  arrivals: (station: string) => Promise<Arrival[]>;
  routes: () => Promise<Topology[]>;
  timetable: (from: string, to: string) => Promise<Timetable>;
  now: () => Date;
  bundled?: { capturedAt: string; maxAgeDays: number; topology: Topology[] };
  rateLimit?: RateLimitAdapter;
};
const live: JourneyDependencies = {
  arrivals: getArrivals,
  routes: getRoutes,
  timetable: getTimetable,
  now: () => new Date(),
  bundled: bundledTopology,
};
const headers = { "Cache-Control": "no-store" };
function response(body: object, status = 200, additionalHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...headers, ...additionalHeaders } });
}
function topologyFresh(
  value: NonNullable<JourneyDependencies["bundled"]>,
  now: Date,
): boolean {
  const capturedAt = new Date(value.capturedAt).getTime();
  if (!Number.isFinite(capturedAt) || capturedAt > now.getTime()) return false;
  return (
    now.getTime() - capturedAt <=
      value.maxAgeDays * 86_400_000
  );
}
/** Accepts only a non-empty, fully parseable route snapshot at this boundary. */
function usableTopology(value: unknown): Topology[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed = value.map((item) => topologySchema.safeParse(item));
  if (parsed.some((item) => !item.success)) return null;
  const topology: Topology[] = [];
  for (const item of parsed) {
    if (!item.success) return null;
    topology.push(item.data);
  }
  return topology.some((item) => item.orderedLineRoutes.length > 0)
    ? topology
    : null;
}
/** Dependency-injected request handler with safe topology fallback and partial ETA degradation. */
export function createJourneyHandler(deps: JourneyDependencies = live) {
  return async (request: Request): Promise<NextResponse> => {
    const rateLimit = deps.rateLimit ?? allowAllRateLimit;
    if (!(await rateLimit(request)).allowed)
      return response(RATE_LIMIT_RESPONSE, 429, { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) });
    const topologyStartedAt = Date.now();
    const parsed = journeyQuery.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (
      !parsed.success ||
      parsed.data.from === parsed.data.to ||
      !byId.has(parsed.data.from) ||
      !byId.has(parsed.data.to)
    )
      return response({ error: "INVALID_JOURNEY" }, 400);
    const { from, to } = parsed.data;
    const now = deps.now();
    let liveTopology: Topology[] | null = null;
    let topologyError: unknown;
    try {
      liveTopology = usableTopology(await deps.routes());
      if (!liveTopology)
        topologyError = new TflError("topology", "TfL route topology was unusable");
    } catch (error) {
      topologyError = error instanceof TflError
        ? error
        : new TflError("topology", "TfL route topology was unavailable");
    }
    const source =
      liveTopology ??
      (deps.bundled && topologyFresh(deps.bundled, now)
        ? usableTopology(deps.bundled.topology)
        : null);
    recordServerDiagnostic({
      operation: "journey_topology",
      durationMs: Date.now() - topologyStartedAt,
      error: topologyError,
      topologyFallbackUsed: liveTopology === null && source !== null,
    });
    if (!source) return response({ error: "TFL_UNAVAILABLE" }, 503);
    const routes = source.flatMap((topology) => topology.orderedLineRoutes);
    if (!isDirectPair(routes, from, to))
      return response({ error: "INVALID_JOURNEY" }, 400);
    const [origin, destination, timetable] = await Promise.allSettled([
      deps.arrivals(from),
      deps.arrivals(to),
      deps.timetable(from, to),
    ]);
    if (origin.status === "rejected") {
      const failure = origin.reason;
      return response(
        {
          error:
            failure instanceof TflError && failure.code === "config"
              ? "CONFIGURATION_ERROR"
              : "TFL_UNAVAILABLE",
        },
        failure instanceof TflError && failure.code === "config" ? 500 : 503,
      );
    }
    const originArrivals = origin.value.filter(
      (arrival) => arrival.naptanId === from,
    );
    const downstream =
      destination.status === "fulfilled"
        ? normalizePredictions(
            destination.value.filter((arrival) => arrival.naptanId === to),
            now,
          )
        : [];
    const table =
      timetable.status === "fulfilled" &&
      timetable.value.lineId === "northern" &&
      timetable.value.timetable.departureStopId === from
        ? timetable.value
        : null;
    let withheld = 0;
    const suitable = normalizePredictions(
      originArrivals,
      now,
    ).flatMap(
      (train) => {
        const judgement = selectSuitable(
          routeCandidates(
            routes,
            from,
            to,
            train.canonicalTerminus ?? undefined,
            train.towards ?? undefined,
          ),
          from,
          to,
        );
        if (!judgement.suitable) {
          if (judgement.withheld) withheld++;
          return [];
        }
        const runtime = table ? scheduledRuntime(train, table, to) : null;
        const liveEta = liveDestinationEta(train, downstream, now, runtime);
        const estimate =
          !liveEta && table ? timetableEta(train, table, to, now) : null;
        const eta = liveEta ?? estimate;
        const evidence: EtaEvidence = liveEta
          ? "live"
          : estimate
            ? "estimate"
            : "unavailable";
        return [
          {
            ...train,
            routeConfidence: judgement.confidence,
            servicePatternId: judgement.candidate?.servicePatternId ?? null,
            via: branchLabel(judgement.candidate?.branch ?? null),
            destinationArrival: eta?.arrival ?? null,
            destinationSeconds: eta?.seconds ?? null,
            evidence,
            strength: evidence,
          },
        ];
      },
    );
    const ranked = rankTrains(suitable);
    const displayed = ranked.trains.slice(0, 8);
    if (ranked.fastest && !displayed.some((train) => train.id === ranked.fastest!.id)) {
      let removable = displayed.length - 1;
      while (removable >= 0 && displayed[removable]?.id === ranked.next?.id)
        removable--;
      if (removable >= 0) displayed.splice(removable, 1);
      displayed.push(ranked.fastest);
      displayed.sort(
        (a, b) =>
          a.secondsToOrigin - b.secondsToOrigin || a.id.localeCompare(b.id),
      );
    }
    return response({
      journey: { from, to },
      observedAt: now.toISOString(),
      predictionGeneratedAt: originArrivals[0]?.timestamp ?? null,
      refreshAfterSeconds: 30,
      trains: displayed,
      additionalSuitableCount: Math.max(0, suitable.length - displayed.length),
      withheldAmbiguousCount: withheld,
      nextTrainId: ranked.nextTrainId,
      fastestTrainId: ranked.fastestTrainId,
      qualification: ranked.qualification,
      rankings: ranked.ranking,
      minutesSaved: ranked.minutesSaved,
    });
  };
}
export const GET = createJourneyHandler();
