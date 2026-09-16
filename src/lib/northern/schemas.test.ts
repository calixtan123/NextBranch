import { describe, expect, it } from "vitest";
import { parseArrivals, timetableSchema, topologySchema } from "./schemas";
const valid = {
  id: "1",
  naptanId: "940GZZLUCTN",
  lineId: "northern",
  expectedArrival: "2026-09-14T12:00:00.000Z",
};
describe("TfL boundary", () => {
  it("rejects invalid top-level payload", () =>
    expect(() => parseArrivals({})).toThrow());
  it("drops malformed individual records", () =>
    expect(parseArrivals([valid, { id: "bad" }])).toHaveLength(1));
  it("accepts only the Northern line for topology and timetable", () => {
    expect(() =>
      topologySchema.parse({ lineId: "piccadilly", orderedLineRoutes: [] }),
    ).toThrow();
    expect(() =>
      timetableSchema.parse({
        lineId: "piccadilly",
        timetable: { departureStopId: "from", routes: [] },
      }),
    ).toThrow();
  });
});
