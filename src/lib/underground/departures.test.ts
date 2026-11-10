/** Underground normalization retains physical evidence without changing Northern journeys. */
import { describe, expect, it } from "vitest";
import { normalizeUndergroundPredictions, undergroundPlatformInfo } from "./departures";
import type { Arrival } from "../northern/schemas";

const now = new Date("2026-11-10T12:00:00Z");
const arrival = (extra: Partial<Arrival> = {}): Arrival => ({ id: "train", lineId: "central", naptanId: "stop", expectedArrival: "2026-11-10T12:01:00Z", timestamp: now.toISOString(), platformName: "Eastbound - Platform 1", ...extra });

describe("Underground platform labels", () => {
  it.each([
    ["Northbound - Platform 1", "Northbound", "1"], ["Southbound Fast - Platform 6", "Southbound", "6"],
    ["EastBound - Platform 1", "Eastbound", "1"], ["Westbound Platform 26", "Westbound", "26"],
    ["Eastbound - Platform 2 ", "Eastbound", "2"],
  ])("retains the explicit number and cardinal direction from %s", (label, direction, platform) => {
    expect(undergroundPlatformInfo(label)).toEqual({ direction, platform, confirmed: true });
  });
  it.each([undefined, "Platform 1", "Inner Rail - Platform 1", "Platform 2/3", "North / South", "Northbound - Platform 1 Southbound", "940GZZLUCND-Plat01-NB-northern"])("leaves ambiguous label %s unconfirmed", label => {
    expect(undergroundPlatformInfo(label)).toEqual({ direction: null, platform: null, confirmed: false });
  });
});

it("keeps all cardinal directions, line and stop identity without deduplicating different feeds", () => {
  const values = ["Northbound", "Southbound", "Eastbound", "Westbound"].map((direction, index) => arrival({ lineId: index % 2 ? "district" : "central", naptanId: `stop-${index}`, platformName: `${direction} - Platform 1` }));
  const result = normalizeUndergroundPredictions([...values, values[0]], now);
  expect(result).toHaveLength(4);
  expect(result.map(v => v.direction)).toEqual(["Northbound", "Southbound", "Eastbound", "Westbound"]);
  expect(result.map(v => v.stopAreaId)).toEqual(values.map(v => v.naptanId));
  expect(result.map(v => v.lineId)).toEqual(values.map(v => v.lineId));
});

it("drops stale, departed, future-generated and non-Underground records", () => {
  expect(normalizeUndergroundPredictions([
    arrival(), arrival({ id: "stale", timestamp: "2026-11-10T11:50:00Z" }),
    arrival({ id: "departed", expectedArrival: "2026-11-10T11:50:00Z" }),
    arrival({ id: "future", timestamp: "2026-11-10T12:10:00Z" }),
    arrival({ id: "other-mode", lineId: "mildmay" }),
  ], now).map(v => v.id)).toEqual(["central:stop:train"]);
});

it("preserves Northern normalization and confidence while retaining its stop area", () => {
  const [train] = normalizeUndergroundPredictions([arrival({ lineId: "northern", platformName: undefined, direction: "outbound", towards: "Morden via Bank" })], now);
  expect(train).toMatchObject({ id: "train", lineId: "northern", direction: "Northbound", platform: null, platformConfirmed: false, stopAreaId: "stop" });
});
