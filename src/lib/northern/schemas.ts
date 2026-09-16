import { z } from "zod";
const iso = z.string().datetime({ offset: true });
export const journeyQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
/** Raw TfL prediction boundary. Unknown fields never pass into the domain. */
export const arrivalSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    vehicleId: z.string().optional(),
    naptanId: z.string(),
    lineId: z.string(),
    destinationNaptanId: z.string().optional(),
    destinationName: z.string().optional(),
    expectedArrival: iso,
    timestamp: iso.optional(),
    timeToStation: z.number().optional(),
    platformName: z.string().optional(),
    direction: z.string().optional(),
    towards: z.string().optional(),
  })
  .strip();
export const arrivalsSchema = z.array(z.unknown());
export type Arrival = z.infer<typeof arrivalSchema>;
export function parseArrivals(value: unknown): Arrival[] {
  const list = arrivalsSchema.parse(value);
  return list.flatMap((item) => {
    const parsed = arrivalSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
const stop = z
  .object({ id: z.string().optional(), stationId: z.string().optional() })
  .passthrough();
export const topologySchema = z
  .object({
    lineId: z.literal("northern"),
    direction: z.string().optional(),
    orderedLineRoutes: z
      .array(
        z
          .object({
            name: z.string().optional(),
            naptanIds: z.array(z.string()),
            serviceType: z.string().optional(),
          })
          .strip(),
      )
      .default([]),
    stopPointSequences: z
      .array(
        z
          .object({
            branchId: z.union([z.number(), z.string()]).optional(),
            stopPoint: z.array(stop),
          })
          .strip(),
      )
      .default([]),
  })
  .strip();
export type Topology = z.infer<typeof topologySchema>;
const knownJourney = z
  .object({
    hour: z.union([z.string(), z.number()]),
    minute: z.union([z.string(), z.number()]),
    intervalId: z.union([z.string(), z.number()]),
  })
  .strip();
export const timetableSchema = z
  .object({
    lineId: z.literal("northern"),
    timetable: z
      .object({
        departureStopId: z.string(),
        routes: z.array(
          z
            .object({
              stationIntervals: z.array(
                z
                  .object({
                    id: z.union([z.string(), z.number()]),
                    intervals: z.array(
                      z
                        .object({
                          stopId: z.string(),
                          timeToArrival: z.number().optional(),
                          timeToDeparture: z.number().optional(),
                        })
                        .strip(),
                    ),
                  })
                  .strip(),
              ),
              schedules: z.array(
                z
                  .object({
                    name: z.string(),
                    knownJourneys: z.array(knownJourney),
                  })
                  .strip(),
              ),
            })
            .strip(),
        ),
      })
      .strip(),
  })
  .strip();
export type Timetable = z.infer<typeof timetableSchema>;
