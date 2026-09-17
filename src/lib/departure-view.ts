import { z } from "zod";

const departureSchema = z.object({
  id: z.string().min(1),
  destinationName: z.string().nullable(),
  expectedArrival: z.string().datetime(),
  secondsToStation: z.number().finite(),
  towards: z.string().nullable(),
});
const platformSchema = z.object({
  platform: z.string().nullable(),
  direction: z.enum(["Northbound", "Southbound"]).nullable(),
  departures: z.array(departureSchema),
});
const responseSchema = z.object({
  station: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  observedAt: z.string().datetime(),
  newestPredictionGeneratedAt: z.string().datetime().nullable(),
  refreshAfterSeconds: z.number().int().positive(),
  platforms: z.array(platformSchema),
});

export type Departure = z.infer<typeof departureSchema> & {
  platform: string | null;
  direction: "Northbound" | "Southbound" | null;
};
export type DeparturePlatform = z.infer<typeof platformSchema>;
export type DeparturesResponse = z.infer<typeof responseSchema>;

/** Validates untrusted departure JSON and proves it belongs to the requested station. */
export function parseDeparturesResponse(
  value: unknown,
  requestedStation?: string,
): DeparturesResponse | null {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) return null;
  if (requestedStation && parsed.data.station.id !== requestedStation) return null;
  return parsed.data;
}

/** Groups live departures without discarding a prediction or inventing a platform. */
export function groupDepartures(items: readonly Departure[]): DeparturePlatform[] {
  const grouped = new Map<string, DeparturePlatform>();
  for (const item of items) {
    const key = `${item.platform ?? ""}\u0000${item.direction ?? ""}`;
    const group = grouped.get(key) ?? {
      platform: item.platform,
      direction: item.direction,
      departures: [],
    };
    group.departures.push({
      id: item.id,
      destinationName: item.destinationName,
      expectedArrival: item.expectedArrival,
      secondsToStation: item.secondsToStation,
      towards: item.towards,
    });
    grouped.set(key, group);
  }
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      departures: group.departures.toSorted(
        (a, b) =>
          new Date(a.expectedArrival).getTime() - new Date(b.expectedArrival).getTime() ||
          a.id.localeCompare(b.id),
      ),
    }))
    .toSorted((a, b) => {
      const unavailable = Number(a.platform === null) - Number(b.platform === null);
      if (unavailable) return unavailable;
      return (
        (a.platform ?? "").localeCompare(b.platform ?? "", undefined, { numeric: true }) ||
        (a.direction ?? "").localeCompare(b.direction ?? "")
      );
    });
}
