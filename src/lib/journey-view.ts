import { z } from "zod";

const trainSchema = z.object({
  id: z.string().min(1),
  destinationName: z.string().nullable(),
  expectedArrival: z.string().datetime(),
  secondsToOrigin: z.number().finite(),
  platform: z.string().nullable(),
  direction: z.enum(["Northbound", "Southbound"]).nullable(),
  platformConfirmed: z.boolean(),
  routeConfidence: z.enum(["confirmed", "inferred"]),
  via: z.string().nullable(),
  destinationArrival: z.string().datetime().nullable(),
  destinationSeconds: z.number().finite().nullable(),
  evidence: z.enum(["live", "estimate", "unavailable"]),
});
const responseSchema = z.object({
  journey: z.object({ from: z.string(), to: z.string() }),
  observedAt: z.string().datetime(),
  predictionGeneratedAt: z.string().datetime().nullable(),
  refreshAfterSeconds: z.number().int().positive().optional(),
  trains: z.array(trainSchema).max(8),
  additionalSuitableCount: z.number().int().nonnegative(),
  withheldAmbiguousCount: z.number().int().nonnegative(),
  nextTrainId: z.string().nullable(),
  fastestTrainId: z.string().nullable(),
  qualification: z.enum(["best_arrival", "fastest_arrival", "fastest_known"]).nullable(),
  rankings: z.enum(["best_arrival", "fastest_arrival", "fastest_known"]).nullable(),
  minutesSaved: z.number().finite().nonnegative().nullable(),
});
export type JourneyTrain = z.infer<typeof trainSchema>;
export type JourneyResponse = z.infer<typeof responseSchema>;
/** Validates untrusted JSON and, when supplied, the exact requested journey. */
export function parseJourneyResponse(
  value: unknown,
  requestedJourney?: { from: string; to: string },
): JourneyResponse | null {
  const result = responseSchema.safeParse(value);
  if (!result.success) return null;
  if (
    requestedJourney &&
    (result.data.journey.from !== requestedJourney.from ||
      result.data.journey.to !== requestedJourney.to)
  )
    return null;
  return result.data;
}
