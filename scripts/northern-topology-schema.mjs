/** Validates the reviewed, Northern-only route snapshot used to generate application artifacts. */

import { z } from "zod";

const routeSchema = z.object({
  name: z.string().optional(),
  naptanIds: z.array(z.string().regex(/^940GZZ[A-Z0-9]+$/)).min(2),
  serviceType: z.string().optional(),
}).strip();

const topologySchema = z.object({
  lineId: z.literal("northern"),
  direction: z.string().optional(),
  orderedLineRoutes: z.array(routeSchema).default([]),
  stopPointSequences: z.array(z.object({
    branchId: z.union([z.number(), z.string()]).optional(),
    stopPoint: z.array(z.object({ id: z.string().optional(), stationId: z.string().optional() }).passthrough()),
  }).strip()).default([]),
}).strip();

/** Schema for a sanitized TfL capture that is safe to turn into the bundled Northern fallback. */
export const northernTopologyCaptureSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }),
  topology: z.array(topologySchema).min(1),
}).strip().refine(
  (capture) => capture.topology.some((item) => item.orderedLineRoutes.length > 0),
  "Northern topology capture contains no ordered routes",
);
