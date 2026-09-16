import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createJourneyHandler } from "./route";
import { TflError } from "@/lib/tfl/client";
import { bundledTopology } from "@/lib/northern/bundledTopology";
import { arrivalSchema, timetableSchema } from "@/lib/northern/schemas";
const now = new Date("2026-09-16T12:00:00.000Z");
const table = timetableSchema.parse({
  lineId: "northern",
  timetable: { departureStopId: "940GZZLUCTN", routes: [] },
});
const base = {
  routes: async () => bundledTopology.topology,
  timetable: async () => table,
  now: () => now,
  bundled: bundledTopology,
};
const request = (from: string | null, to: string | null) =>
  new Request(
    `http://local/api/journey${from && to ? `?from=${from}&to=${to}` : ""}`,
  );
describe("journey API", () => {
  it("rejects invalid query before downstream requests", async () => {
    const arrivals = vi.fn();
    const timetable = vi.fn();
    const get = createJourneyHandler({ ...base, arrivals, timetable });
    expect((await get(request(null, null))).status).toBe(400);
    expect(arrivals).not.toHaveBeenCalled();
    expect(timetable).not.toHaveBeenCalled();
  });
  it("rejects equal, unknown, and indirect pairs before arrivals or timetable", async () => {
    const arrivals = vi.fn();
    const timetable = vi.fn();
    const get = createJourneyHandler({ ...base, arrivals, timetable });
    for (const pair of [
      ["940GZZLUCTN", "940GZZLUCTN"],
      ["unknown", "940GZZLUEGW"],
      ["940GZZLUBNK", "940GZZLUCHX"],
    ] as const) {
      expect((await get(request(pair[0], pair[1]))).status).toBe(400);
    }
    expect(arrivals).not.toHaveBeenCalled();
    expect(timetable).not.toHaveBeenCalled();
  });
  it("keeps a valid empty origin as no-store 200", async () => {
    const get = createJourneyHandler({ ...base, arrivals: async () => [] });
    const response = await get(request("940GZZLUCTN", "940GZZLUEGW"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.trains).toEqual([]);
    expect(body).toHaveProperty("minutesSaved", null);
  });
  it("maps origin failure to 503", async () => {
    const get = createJourneyHandler({
      ...base,
      arrivals: async () => {
        throw Error("down");
      },
    });
    expect((await get(request("940GZZLUCTN", "940GZZLUEGW"))).status).toBe(503);
  });
  it("maps configuration failure to 500 and keeps no-store on failures", async () => {
    const get = createJourneyHandler({
      ...base,
      arrivals: async () => { throw new TflError("config", "missing"); },
    });
    const result = await get(request("940GZZLUCTN", "940GZZLUEGW"));
    expect(result.status).toBe(500);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
  it("degrades destination and timetable failures without inventing live ETA", async () => {
    const origin = arrivalSchema.parse({
      id: "origin", vehicleId: "vehicle-1", naptanId: "940GZZLUCTN", lineId: "northern",
      destinationNaptanId: "940GZZLUEGW", expectedArrival: "2026-09-16T12:10:00.000Z",
      timestamp: "2026-09-16T11:59:00.000Z", towards: "Edgware via Charing Cross",
    });
    const destination = arrivalSchema.parse({ ...origin, id: "destination", naptanId: "940GZZLUEGW" });
    const destinationFailure = createJourneyHandler({
      ...base,
      arrivals: async (station) => { if (station === "940GZZLUEGW") throw Error("down"); return [origin]; },
      timetable: async () => table,
    });
    const estimateBody = await (await destinationFailure(request("940GZZLUCTN", "940GZZLUEGW"))).json();
    expect(estimateBody.trains[0]?.evidence).toBe("unavailable");

    const timetableFailure = createJourneyHandler({
      ...base,
      arrivals: async (station) => station === "940GZZLUEGW" ? [destination] : [origin],
      timetable: async () => { throw Error("down"); },
    });
    const liveUnavailableBody = await (await timetableFailure(request("940GZZLUCTN", "940GZZLUEGW"))).json();
    expect(liveUnavailableBody.trains[0]?.evidence).toBe("unavailable");
  });
  it("filters injected origin and destination snapshots by requested station", async () => {
    const origin = arrivalSchema.parse({
      id: "origin",
      vehicleId: "vehicle-1",
      naptanId: "940GZZLUCTN",
      lineId: "northern",
      destinationNaptanId: "940GZZLUEGW",
      expectedArrival: "2026-09-16T12:10:00.000Z",
      timestamp: "2026-09-16T11:59:00.000Z",
      towards: "Edgware via Charing Cross",
    });
    const wrongOrigin = arrivalSchema.parse({
      ...origin,
      id: "wrong-origin",
      naptanId: "940GZZLUBNK",
    });
    const wrongDestination = arrivalSchema.parse({
      ...origin,
      id: "wrong-destination",
      naptanId: "940GZZLUSKW",
      expectedArrival: "2026-09-16T12:20:00.000Z",
    });
    const get = createJourneyHandler({
      ...base,
      arrivals: async (station) =>
        station === "940GZZLUCTN"
          ? [wrongOrigin, origin]
          : [wrongDestination],
    });

    const body = await (await get(request("940GZZLUCTN", "940GZZLUEGW"))).json();
    expect(body.trains).toHaveLength(1);
    expect(body.trains[0].id).toBe("origin");
    expect(body.trains[0].evidence).toBe("unavailable");
  });
  it("uses fresh bundled topology when live topology is empty or malformed", async () => {
    const arrivals = vi.fn().mockResolvedValue([]);
    const get = createJourneyHandler({
      ...base,
      arrivals,
      routes: async () => [],
    });
    expect((await get(request("940GZZLUCTN", "940GZZLUEGW"))).status).toBe(200);
    expect(arrivals).toHaveBeenCalled();

    const unavailable = createJourneyHandler({
      ...base,
      arrivals: async () => [],
      routes: async () => [{ nope: true }] as never,
      bundled: { ...bundledTopology, capturedAt: "2020-01-01T00:00:00.000Z" },
    });
    expect((await unavailable(request("940GZZLUCTN", "940GZZLUEGW"))).status).toBe(503);
    for (const capturedAt of ["not-a-date", "2026-09-17T12:00:00.000Z"]) {
      const futureOrInvalid = createJourneyHandler({
        ...base,
        arrivals: async () => [],
        routes: async () => [],
        bundled: { ...bundledTopology, capturedAt },
      });
      expect(
        (await futureOrInvalid(request("940GZZLUCTN", "940GZZLUEGW"))).status,
      ).toBe(503);
    }
  });
  it("does not use a timetable for a different departure station", async () => {
    const origin = arrivalSchema.parse({
      id: "origin",
      vehicleId: "vehicle-1",
      naptanId: "940GZZLUCTN",
      lineId: "northern",
      destinationNaptanId: "940GZZLUEGW",
      expectedArrival: "2026-09-16T12:10:00.000Z",
      timestamp: "2026-09-16T11:59:00.000Z",
      towards: "Edgware via Charing Cross",
    });
    const destination = arrivalSchema.parse({
      ...origin,
      id: "destination",
      naptanId: "940GZZLUEGW",
      expectedArrival: "2026-09-16T12:32:00.000Z",
    });
    const mismatchedTable = timetableSchema.parse({
      lineId: "northern",
      timetable: {
        departureStopId: "940GZZLUBNK",
        routes: [
          {
            schedules: [
              {
                name: "Monday - Thursday",
                knownJourneys: [{ hour: 13, minute: 10, intervalId: "a" }],
              },
            ],
            stationIntervals: [
              { id: "a", intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 22 }] },
            ],
          },
        ],
      },
    });
    const get = createJourneyHandler({
      ...base,
      arrivals: async (station) =>
        station === "940GZZLUCTN" ? [origin] : [destination],
      timetable: async () => mismatchedTable,
    });
    const body = await (await get(request("940GZZLUCTN", "940GZZLUEGW"))).json();
    expect(body.trains[0]).toMatchObject({
      evidence: "unavailable",
      destinationArrival: null,
    });
  });
  it("caps suitable response at eight", async () => {
    const arrivals = async (id: string) =>
      id === "940GZZLUCTN"
        ? Array.from({ length: 9 }, (_, index) =>
            arrivalSchema.parse({
              id: String(index),
              vehicleId: String(index),
              naptanId: id,
              lineId: "northern",
              destinationNaptanId: "940GZZLUEGW",
              expectedArrival: `2026-09-16T12:0${index}:00.000Z`,
              timestamp: "2026-09-16T11:59:30.000Z",
              towards: "Edgware via Charing Cross",
            }),
          )
        : [];
    const body = await (
      await createJourneyHandler({
        ...base,
        arrivals,
        routes: async () => [
          {
            lineId: "northern",
            direction: "outbound",
            stopPointSequences: [],
            orderedLineRoutes: [
              {
                name: "test via Charing Cross",
                naptanIds: ["940GZZLUMDN", "940GZZLUCTN", "940GZZLUCHX", "940GZZLUEGW"],
              },
            ],
          },
        ],
      })(request("940GZZLUCTN", "940GZZLUEGW"))
    ).json();
    expect(body.trains).toHaveLength(8);
    expect(body.additionalSuitableCount).toBe(1);
  });
  it("retains the fastest train when it is ninth in origin order", async () => {
    const from = "940GZZLUCTN";
    const to = "940GZZLUEGW";
    const origin = (index: number) =>
      arrivalSchema.parse({
        id: String(index),
        vehicleId: `vehicle-${index}`,
        naptanId: from,
        lineId: "northern",
        destinationNaptanId: to,
        expectedArrival: `2026-09-16T12:${String(index).padStart(2, "0")}:00.000Z`,
        timestamp: "2026-09-16T11:59:30.000Z",
        towards: "Edgware via Charing Cross",
      });
    const destination = (index: number) =>
      arrivalSchema.parse({
        ...origin(index),
        id: `destination-${index}`,
        naptanId: to,
        expectedArrival: `2026-09-16T12:${String(index === 8 ? 9 : index + 10).padStart(2, "0")}:00.000Z`,
      });
    const table = timetableSchema.parse({
      lineId: "northern",
      timetable: {
        departureStopId: from,
        routes: [
          {
            schedules: [
              {
                name: "Monday - Sunday",
                knownJourneys: [{ hour: 13, minute: 0, intervalId: "0" }],
              },
            ],
            stationIntervals: [
              { id: "0", intervals: [{ stopId: to, timeToArrival: 1 }] },
            ],
          },
        ],
      },
    });
    const body = await (
      await createJourneyHandler({
        ...base,
        timetable: async () => table,
        arrivals: async (station) =>
          station === from
            ? Array.from({ length: 9 }, (_, index) => origin(index))
            : Array.from({ length: 9 }, (_, index) => destination(index)),
        routes: async () => [
          {
            lineId: "northern",
            direction: "outbound",
            stopPointSequences: [],
            orderedLineRoutes: [
              {
                name: "test via Charing Cross",
                naptanIds: [from, "940GZZLUCHX", to],
              },
            ],
          },
        ],
      })(request(from, to))
    ).json();
    expect(body.trains).toHaveLength(8);
    expect(body.trains.map((train: { id: string }) => train.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "8",
    ]);
    expect(body.nextTrainId).toBe("0");
    expect(body.fastestTrainId).toBe("8");
    expect(body.additionalSuitableCount).toBe(1);
  });
});
