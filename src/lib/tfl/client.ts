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
import { recordServerDiagnostic, type DiagnosticOperation } from "./diagnostics";

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
const inFlightArrivals = new Map<string, Promise<Arrival[]>>();

/** Fetch a complete payload before the deadline or caller cancellation. */
async function get(
  path: string,
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

async function fetchArrivals(id: string, signal?: AbortSignal): Promise<Arrival[]> {
  return diagnose("arrivals", async () => {
    try {
      return parseArrivals(
        await get(`/Line/northern/Arrivals/${encodeURIComponent(id)}`, "live", signal),
      ).filter((arrival) => arrival.naptanId === id);
    } catch (error) {
      if (error instanceof TflError) throw error;
      throw new TflError("upstream", "TfL arrivals payload invalid");
    }
  });
}

/**
 * Fetches and validates the uncached live arrival snapshot for one station.
 *
 * Simultaneous calls without caller cancellation share only their pending promise.
 * The promise is removed after either settlement, so later requests always fetch a
 * fresh live prediction.
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
  if (signal) return fetchArrivals(id, signal);
  const existing = inFlightArrivals.get(id);
  if (existing) return existing;
  const request = fetchArrivals(id);
  inFlightArrivals.set(id, request);
  request.then(
    () => { if (inFlightArrivals.get(id) === request) inFlightArrivals.delete(id); },
    () => { if (inFlightArrivals.get(id) === request) inFlightArrivals.delete(id); },
  );
  return request;
}

/** Fetches the route sequence using Next's bounded server cache. */
export async function getRoutes(signal?: AbortSignal): Promise<Topology[]> {
  return diagnose("topology", async () => {
    try {
      const raw = await get("/Line/northern/Route/Sequence/all", "topology", signal);
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
