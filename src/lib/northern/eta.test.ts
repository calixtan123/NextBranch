import { describe, expect, it } from "vitest";
import timetableFixture from "../../../tests/fixtures/tfl/timetable-camden-edgware.json";
import { timetableSchema } from "./schemas";
import { timetableEta } from "./eta";
import type { Train } from "./predictions";
const train: Train = {
  id: "a",
  vehicleId: "1",
  lineId: "northern",
  canonicalTerminus: "940GZZLUEGW",
  destinationName: "Edgware",
  expectedArrival: "2026-09-14T10:59:00.000Z",
  timestamp: "2026-09-14T10:58:00.000Z",
  secondsToOrigin: 60,
  platform: null,
  direction: null,
  platformConfirmed: false,
  branch: null,
  towards: null,
  routeConfidence: "confirmed",
  servicePatternId: "x",
  destinationArrival: null,
  destinationSeconds: null,
  evidence: "unavailable",
  strength: "unavailable",
  via: null,
};
describe("timetable ETA", () => {
  it("uses cumulative fixture minutes, not seconds", () => {
    const eta = timetableEta(
      train,
      timetableSchema.parse(timetableFixture),
      "940GZZLUEGW",
      new Date("2026-09-14T10:59:00Z"),
    );
    expect(eta?.arrival).toBe("2026-09-14T11:22:00.000Z");
    expect(eta?.runtimeMinutes).toBe(22);
  });

  it("uses the interval from the route supplying the selected schedule", () => {
    const table = timetableSchema.parse({
      lineId: "northern",
      timetable: {
        departureStopId: "940GZZLUCTN",
        routes: [
          {
            schedules: [
              {
                name: "Monday - Thursday",
                knownJourneys: [{ hour: 12, minute: 0, intervalId: "shared" }],
              },
            ],
            stationIntervals: [
              {
                id: "shared",
                intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 22 }],
              },
            ],
          },
          {
            schedules: [],
            stationIntervals: [
              {
                id: "shared",
                intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 99 }],
              },
            ],
          },
        ],
      },
    });
    expect(
      timetableEta(
        train,
        table,
        "940GZZLUEGW",
        new Date("2026-09-14T10:59:00Z"),
      )?.runtimeMinutes,
    ).toBe(22);
  });

  it("fails closed for duplicate schedules and interval entries", () => {
    const duplicateSchedule = timetableSchema.parse({
      lineId: "northern",
      timetable: {
        departureStopId: "940GZZLUCTN",
        routes: [
          {
            schedules: [
              {
                name: "Monday - Thursday",
                knownJourneys: [{ hour: 12, minute: 0, intervalId: "a" }],
              },
              {
                name: "Monday - Thursday",
                knownJourneys: [{ hour: 12, minute: 0, intervalId: "b" }],
              },
            ],
            stationIntervals: [
              { id: "a", intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 22 }] },
              { id: "b", intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 22 }] },
            ],
          },
        ],
      },
    });
    expect(
      timetableEta(
        train,
        duplicateSchedule,
        "940GZZLUEGW",
        new Date("2026-09-14T10:59:00Z"),
      ),
    ).toBeNull();

    const duplicateInterval = timetableSchema.parse({
      lineId: "northern",
      timetable: {
        departureStopId: "940GZZLUCTN",
        routes: [
          {
            schedules: [
              {
                name: "Monday - Thursday",
                knownJourneys: [{ hour: 12, minute: 0, intervalId: "a" }],
              },
            ],
            stationIntervals: [
              { id: "a", intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 22 }] },
              { id: "a", intervals: [{ stopId: "940GZZLUEGW", timeToArrival: 23 }] },
            ],
          },
        ],
      },
    });
    expect(
      timetableEta(
        train,
        duplicateInterval,
        "940GZZLUEGW",
        new Date("2026-09-14T10:59:00Z"),
      ),
    ).toBeNull();
  });
});
