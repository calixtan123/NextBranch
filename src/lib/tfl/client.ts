import "server-only";

import {
  parseArrivals,
  timetableSchema,
  topologySchema,
  type Arrival,
  type Timetable,
  type Topology,
} from "@/lib/northern/schemas";

export class TflError extends Error {
  constructor(
    public readonly code: "config" | "upstream" | "topology" | "timetable",
    message: string,
  ) {
    super(message);
    this.name = "TflError";
  }
}

const BASE_URL = "https://api.tfl.gov.uk";
const TOPOLOGY_REVALIDATE_SECONDS = 43_200;

async function get(
  path: string,
  cache: "live" | "topology" = "topology",
): Promise<unknown> {
  const key = process.env.TFL_API_KEY;
  if (!key) throw new TflError("config", "TfL configuration is unavailable");

  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}app_key=${encodeURIComponent(key)}`;
  const response = await fetch(
    url,
    cache === "topology"
      ? { next: { revalidate: TOPOLOGY_REVALIDATE_SECONDS } }
      : { cache: "no-store" },
  );
  if (!response.ok)
    throw new TflError("upstream", `TfL upstream status ${response.status}`);
  return response.json();
}

/** Fetches and validates the uncached live arrival snapshot for one station. */
export async function getArrivals(id: string): Promise<Arrival[]> {
  try {
    return parseArrivals(
      await get(`/Line/northern/Arrivals/${encodeURIComponent(id)}`, "live"),
    ).filter((arrival) => arrival.naptanId === id);
  } catch (error) {
    if (error instanceof TflError) throw error;
    throw new TflError("upstream", "TfL arrivals payload invalid");
  }
}

/** Fetches the route sequence using Next's bounded server cache. */
export async function getRoutes(): Promise<Topology[]> {
  try {
    const raw = await get("/Line/northern/Route/Sequence/all");
    const values = Array.isArray(raw) ? raw : [raw];
    return values.map((value) => topologySchema.parse(value));
  } catch (error) {
    if (error instanceof TflError) throw error;
    throw new TflError("topology", "TfL route payload invalid");
  }
}

/** Fetches the selected pair's timetable using the bounded server cache. */
export async function getTimetable(
  from: string,
  to: string,
): Promise<Timetable> {
  try {
    const timetable = timetableSchema.parse(
      await get(
        `/Line/northern/Timetable/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`,
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
}
