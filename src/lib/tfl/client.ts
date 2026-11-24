/** Server-only TfL transport, bounded requests, and validated upstream payloads. */
import "server-only";

import {
  parseArrivals,
  timetableSchema,
  topologySchema,
  type Arrival,
  type Timetable,
  type Topology,
} from "@/lib/northern/schemas";
import { recordServerDiagnostic, recordTflFetchAttempt, type DiagnosticOperation } from "./diagnostics";

/** Classifies safe, public failures without including credential-bearing URLs. */
export class TflError extends Error {
  constructor(
    public readonly code: "config" | "upstream" | "topology" | "timetable",
    message: string,
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "TflError";
  }
}

const BASE_URL = "https://api.tfl.gov.uk";
const TOPOLOGY_REVALIDATE_SECONDS = 43_200;
// The browser has a 20-second overall budget. A journey may first fetch topology,
// then arrivals/timetable in parallel: two sequential eight-second stages leave
// room for processing and delivering the response within that browser budget.
const TFL_REQUEST_TIMEOUT_MS = 8_000;
// Ten seconds keeps repeated boards within the same short source snapshot.
const ARRIVALS_CACHE_TTL_MS = 10_000;
const ARRIVALS_CACHE_CAPACITY = 256;

/** Validated feed data with its original successful fetch-completion time. */
export type ArrivalsFeed = { arrivals: Arrival[]; fetchedAt: string };
const inFlightArrivals = new Map<string, Promise<ArrivalsFeed>>();
const completedArrivals = new Map<string, ArrivalsFeed>();

/** Fetch a complete payload before the deadline or caller cancellation. */
async function get(
  path: string,
  operation: DiagnosticOperation,
  cache: "live" | "topology" = "topology",
  callerSignal?: AbortSignal,
): Promise<unknown> {
  const key = process.env.TFL_API_KEY;
  if (!key) throw new TflError("config", "TfL configuration is unavailable");

  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}app_key=${encodeURIComponent(key)}`;
  const deadline = new AbortController();
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, deadline.signal])
    : deadline.signal;
  // An owned timer can be cleared on completion; AbortSignal.timeout cannot.
  const timer = setTimeout(() => deadline.abort(), TFL_REQUEST_TIMEOUT_MS);
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // Settle independently of transport cooperation, including body reads.
    // Promise.race also observes late transport rejection after cancellation.
    const payload = (async () => {
      signal.throwIfAborted();
      recordTflFetchAttempt(operation);
      const response = await fetch(url, {
        ...(cache === "topology"
          ? { next: { revalidate: TOPOLOGY_REVALIDATE_SECONDS } }
          : { cache: "no-store" as const }),
        signal,
      });
      signal.throwIfAborted();
      if (!response.ok)
        throw new TflError("upstream", `TfL upstream status ${response.status}`, response.status);
      return response.json();
    })();
    return await Promise.race([payload, aborted]);
  } catch (error) {
    const normalized = signal.aborted || ((error instanceof DOMException || error instanceof Error) && ["AbortError", "TimeoutError"].includes(error.name))
      ? new TflError("upstream", "TfL request was interrupted")
      : error;
    throw normalized;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** Records the complete fetch-and-validation outcome without retaining raw data. */
async function diagnose<T>(operation: DiagnosticOperation, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let error: unknown;
  try {
    return await work();
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    recordServerDiagnostic({ operation, durationMs: Date.now() - startedAt, error });
  }
}

async function fetchArrivals(lineId: string, id: string, signal?: AbortSignal): Promise<Arrival[]> {
  return diagnose("arrivals", async () => {
    try {
      return parseArrivals(
        await get(`/Line/${encodeURIComponent(lineId)}/Arrivals/${encodeURIComponent(id)}`, "arrivals", "live", signal),
      ).filter((arrival) => arrival.naptanId === id && arrival.lineId === lineId);
    } catch (error) {
      if (error instanceof TflError) throw error;
      throw new TflError("upstream", "TfL arrivals payload invalid");
    }
  });
}

/**
 * Fetches and validates the Northern arrival snapshot for one station.
 *
 * Successful exact feeds are reused for ten seconds. Concurrent cache misses
 * without caller cancellation share their upstream work.
 *
 * Parameters
 * ----------
 * id : str
 *     TfL's station identifier.
 * signal : AbortSignal, optional
 *     A caller-specific cancellation signal. Calls with this signal are not shared
 *     because one caller must not cancel another caller's request.

 * Returns
 * -------
 * Promise[Arrival[]]
 *     Validated arrivals for the requested station.
 */
export function getArrivals(id: string, signal?: AbortSignal): Promise<Arrival[]> {
  return getLineArrivals("northern", id, signal);
}

/**
 * Fetches one exact line/stop feed with bounded successful-result reuse.
 *
 * Parameters
 * ----------
 * lineId : string
 *     Exact TfL line identifier selected by the verified capability boundary.
 * id : string
 *     Published service stop-area identifier.
 * signal : AbortSignal, optional
 *     Caller cancellation. These requests are isolated from shared requests.
 *
 * Returns
 * -------
 * Promise[Arrival[]]
 *     Validated records belonging to both the requested line and stop area.
 *
 * Raises
 * ------
 * TflError
 *     For configuration, transport, timeout or malformed upstream payloads.
 */
export async function getLineArrivals(lineId: string, id: string, signal?: AbortSignal): Promise<Arrival[]> {
  return (await getLineArrivalsFeed(lineId, id, signal)).arrivals;
}

/** Copies the flat validated schema so callers cannot mutate shared cache data. */
function copyFeed(feed: ArrivalsFeed): ArrivalsFeed {
  return { fetchedAt: feed.fetchedAt, arrivals: feed.arrivals.map(arrival => ({ ...arrival })) };
}

/** Stores only successful, uncancelled work and evicts by completion insertion order. */
async function fetchArrivalsFeed(key: string, lineId: string, id: string, signal?: AbortSignal): Promise<ArrivalsFeed> {
  const arrivals = await fetchArrivals(lineId, id, signal);
  if (signal?.aborted) throw new TflError("upstream", "TfL request was interrupted");
  const feed = { arrivals, fetchedAt: new Date().toISOString() };
  // Refreshing an existing key gives the new success its own insertion position.
  completedArrivals.delete(key);
  completedArrivals.set(key, feed);
  if (completedArrivals.size > ARRIVALS_CACHE_CAPACITY) {
    const oldest = completedArrivals.keys().next().value;
    if (oldest !== undefined) completedArrivals.delete(oldest);
  }
  return feed;
}

/**
 * Fetches an exact feed with its original successful source time.
 *
 * Parameters
 * ----------
 * lineId : string
 *     Verified exact TfL line identifier.
 * id : string
 *     Published service stop-area identifier.
 * signal : AbortSignal, optional
 *     Caller cancellation. Cache misses with signals own isolated upstream calls.
 *
 * Returns
 * -------
 * Promise[ArrivalsFeed]
 *     An independent copy of validated arrivals and original fetchedAt time.
 *     Successful empty feeds are reused too. Entries expire at ten seconds and
 *     the oldest inserted success is evicted above 256 completed feed entries.
 *
 * Raises
 * ------
 * TflError
 *     For cancellation, configuration, transport, timeout or invalid payloads.
 */
export async function getLineArrivalsFeed(lineId: string, id: string, signal?: AbortSignal): Promise<ArrivalsFeed> {
  if (signal?.aborted) throw new TflError("upstream", "TfL request was interrupted");
  const key = JSON.stringify([lineId, id]);
  const cached = completedArrivals.get(key);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < ARRIVALS_CACHE_TTL_MS) return copyFeed(cached);
  completedArrivals.delete(key);
  if (signal) return copyFeed(await fetchArrivalsFeed(key, lineId, id, signal));
  let request = inFlightArrivals.get(key);
  if (!request) {
    request = fetchArrivalsFeed(key, lineId, id);
    inFlightArrivals.set(key, request);
    const pending = request;
    request.then(
      () => { if (inFlightArrivals.get(key) === pending) inFlightArrivals.delete(key); },
      () => { if (inFlightArrivals.get(key) === pending) inFlightArrivals.delete(key); },
    );
  }
  return copyFeed(await request);
}

/** Fetches the route sequence using Next's bounded server cache. */
export async function getRoutes(signal?: AbortSignal): Promise<Topology[]> {
  return diagnose("topology", async () => {
    try {
      const raw = await get("/Line/northern/Route/Sequence/all", "topology", "topology", signal);
      const values = Array.isArray(raw) ? raw : [raw];
      return values.map((value) => topologySchema.parse(value));
    } catch (error) {
      if (error instanceof TflError) throw error;
      throw new TflError("topology", "TfL route payload invalid");
    }
  });
}

/** Fetches the selected pair's timetable using the bounded server cache. */
export async function getTimetable(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Timetable> {
  return diagnose("timetable", async () => {
    try {
      const timetable = timetableSchema.parse(
        await get(
          `/Line/northern/Timetable/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`,
          "timetable",
          "topology",
          signal,
        ),
      );
      if (timetable.timetable.departureStopId !== from)
        throw new TflError(
          "timetable",
          "TfL timetable departure stop does not match the request",
        );
      return timetable;
    } catch (error) {
      if (error instanceof TflError) throw error;
      throw new TflError("timetable", "TfL timetable payload invalid");
    }
  });
}
