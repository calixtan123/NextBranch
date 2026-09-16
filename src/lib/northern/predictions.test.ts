import { describe, expect, it } from "vitest";
import {
  liveDestinationEta,
  normalizePredictions,
  type Train,
} from "./predictions";
import type { Arrival } from "./schemas";

const now = new Date("2026-09-14T12:00:00.000Z");
const make = (extra: Partial<Train> = {}): Train => ({
  id: "x", vehicleId: "v", lineId: "northern", canonicalTerminus: "t", destinationName: null,
  expectedArrival: "2026-09-14T12:00:00.000Z", timestamp: "2026-09-14T11:59:00.000Z",
  secondsToOrigin: 60, platform: null, direction: null, platformConfirmed: false,
  branch: null, towards: null, routeConfidence: "confirmed", servicePatternId: "p",
  destinationArrival: null, destinationSeconds: null, evidence: "unavailable", strength: "unavailable", via: null,
  ...extra,
});
const makeArrival = (extra: Partial<Arrival> = {}): Arrival => ({
  id: "upstream-1", vehicleId: "v", naptanId: "940GZZLUCTN", lineId: "northern",
  destinationNaptanId: "t", expectedArrival: "2026-09-14T12:10:00.000Z",
  timestamp: "2026-09-14T11:59:00.000Z", ...extra,
});

describe("live ETA safety", () => {
  it("requires timetable runtime evidence", () => {
    expect(liveDestinationEta(make(), [make({ expectedArrival: "2026-09-14T12:10:00.000Z" })], now)).toBeNull();
  });
  it("accepts a unique compatible snapshot and runtime", () => {
    expect(liveDestinationEta(make(), [make({ expectedArrival: "2026-09-14T12:10:00.000Z" })], new Date("2026-09-14T11:59:00.000Z"), { minutes: 10 })?.arrival).toBe("2026-09-14T12:10:00.000Z");
  });
  it("rejects absent identity, timestamp and nonpositive runtime", () => {
    expect(liveDestinationEta(make({ vehicleId: null }), [], now, { minutes: 10 })).toBeNull();
    expect(liveDestinationEta(make({ timestamp: null }), [], now, { minutes: 10 })).toBeNull();
    expect(liveDestinationEta(make(), [], now, { minutes: 0 })).toBeNull();
  });
  it("accepts the inclusive scheduled minus five and plus twenty boundaries", () => {
    expect(liveDestinationEta(make(), [make({ expectedArrival: "2026-09-14T12:05:00.000Z" })], now, { minutes: 10 })).not.toBeNull();
    expect(liveDestinationEta(make(), [make({ expectedArrival: "2026-09-14T12:30:00.000Z" })], now, { minutes: 10 })).not.toBeNull();
  });
  it("rejects snapshot skew, branch conflict and duplicate matches", () => {
    const origin = make({ branch: "bank" });
    expect(liveDestinationEta(origin, [make({ expectedArrival: "2026-09-14T12:10:00.000Z", timestamp: "2026-09-14T12:00:31.000Z", branch: "bank" })], now, { minutes: 10 })).toBeNull();
    expect(liveDestinationEta(origin, [make({ expectedArrival: "2026-09-14T12:10:00.000Z", branch: "cx" })], now, { minutes: 10 })).toBeNull();
    expect(liveDestinationEta(make(), [make({ id: "x", expectedArrival: "2026-09-14T12:10:00.000Z" }), make({ id: "y", expectedArrival: "2026-09-14T12:10:00.000Z" })], now, { minutes: 10 })).toBeNull();
  });
});

describe("prediction normalization", () => {
  it("keeps only Northern records and exact departure grace", () => {
    const line = makeArrival({ lineId: "piccadilly" });
    const due = makeArrival({ expectedArrival: "2026-09-14T11:59:30.000Z" });
    const departed = makeArrival({ expectedArrival: "2026-09-14T11:59:29.000Z" });
    expect(normalizePredictions([line], now)).toHaveLength(0);
    expect(normalizePredictions([due, departed], now)).toHaveLength(1);
  });
  it("drops predictions with an old timestamp", () => {
    expect(normalizePredictions([makeArrival({ timestamp: "2026-09-14T11:56:59.000Z" })], now)).toHaveLength(0);
    expect(normalizePredictions([makeArrival({ timestamp: "2026-09-14T11:57:00.000Z" })], now)).toHaveLength(1);
  });
  it("accepts the inclusive future timestamp skew and rejects beyond it", () => {
    expect(
      normalizePredictions(
        [makeArrival({ timestamp: "2026-09-14T12:01:30.000Z" })],
        now,
      ),
    ).toHaveLength(1);
    expect(
      normalizePredictions(
        [makeArrival({ timestamp: "2026-09-14T12:01:31.000Z" })],
        now,
      ),
    ).toHaveLength(0);
  });
  it("preserves a valid platform label and direction-only uncertainty", () => {
    const [exact] = normalizePredictions([makeArrival({ platformName: "Northbound - Platform 2" })], now);
    const [direction] = normalizePredictions([makeArrival({ platformName: "Platform 2", direction: "inbound" })], now);
    expect(exact).toMatchObject({ platform: "2", direction: "Northbound", platformConfirmed: true });
    expect(direction).toMatchObject({ platform: null, direction: "Southbound", platformConfirmed: false });
  });
});
