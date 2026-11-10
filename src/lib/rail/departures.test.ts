/** DLR uses explicit platform numbers while retaining unknown live directions. */
import { expect, it } from "vitest";
import { normalizeRailPredictions } from "./departures";
import { railPlatformInfo } from "./platform";
import type { Arrival } from "../northern/schemas";

const now = new Date("2026-11-10T12:00:00Z");
const arrival = (extra: Partial<Arrival> = {}): Arrival => ({ id: "train", lineId: "dlr", naptanId: "940GZZDLCAN", expectedArrival: "2026-11-10T12:01:00Z", timestamp: now.toISOString(), platformName: "Platform 3", ...extra });

it.each([["Platform 3", "3"], ["4a", "4A"], ["4b", "4B"], ["Platform 16", "16"]])("reads DLR's official explicit label %s without inventing direction", (label, platform) => {
  expect(railPlatformInfo("dlr", label)).toEqual({ platform, direction: null, confirmed: true });
});
it.each([undefined, "", "Canary Wharf", "Platform 2/3", "940GZZDLCAN-Plat03", "Northbound - Platform 3"])("leaves unknown or ambiguous DLR label %s unassigned", label => {
  expect(railPlatformInfo("dlr", label)).toEqual({ platform: null, direction: null, confirmed: false });
});
it("preserves Underground confidence and refuses unverified modes", () => {
  expect(railPlatformInfo("central", "Eastbound - Platform 1")).toEqual({ platform: "1", direction: "Eastbound", confirmed: true });
  expect(railPlatformInfo("elizabeth", "Platform 1").confirmed).toBe(false);
});
it("keeps blank DLR fields, exact feed identity, unknown direction and distinct platform suffixes", () => {
  const values = [arrival({ destinationName: "", towards: "" }), arrival({ naptanId: "other-stop" }), arrival({ id: "suffix", platformName: "4a" })];
  const result = normalizeRailPredictions([...values, values[0]], now);
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ stopAreaId: "940GZZDLCAN", lineId: "dlr", platform: "3", direction: null, destinationName: "", towards: "", platformConfirmed: true });
  expect(result[0].id).toMatch(/^dlr:940GZZDLCAN:/);
  expect(result[1].id).toMatch(/^dlr:other-stop:/);
  expect(result[2].platform).toBe("4A");
});
it("drops stale DLR predictions and leaves missing labels unconfirmed despite destination and API direction", () => {
  expect(normalizeRailPredictions([arrival({ timestamp: "2026-11-10T11:00:00Z" })], now)).toEqual([]);
  expect(normalizeRailPredictions([arrival({ platformName: undefined, destinationName: "Bank", direction: "inbound" })], now)[0]).toMatchObject({ platform: null, direction: null, platformConfirmed: false });
});

it("retains every distinct official DLR prediction despite reused upstream IDs and deduplicates repeated snapshots", async () => {
  const fixture = (await import("../../../data/tfl-dlr-canary-wharf-fixture.json")).default;
  const { parseArrivals } = await import("../northern/schemas");
  const predictions = parseArrivals(fixture.predictions);
  expect(new Set(predictions.map(p => p.id)).size).toBe(1);
  const trains = normalizeRailPredictions([...predictions, ...predictions], new Date("2026-11-10T18:58:00Z"));
  expect(trains).toHaveLength(18);
  expect(new Set(trains.map(t => t.id)).size).toBe(18);
  expect(new Set(trains.map(t => t.platform))).toEqual(new Set(["1", "2", "3", "4", "5", "6"]));
});

it.each(['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'])("normalizes current Overground %s with explicit numbers and no inferred cardinal direction", lineId => {
  const trains = normalizeRailPredictions([arrival({ lineId, platformName: 'Platform 1' })], now);
  expect(trains).toHaveLength(1);
  expect(trains[0]).toMatchObject({ lineId, platform: '1', direction: null, platformConfirmed: true });
  for (const platformName of ['Platform Unknown', 'Platform 1/2', 'Northbound - Platform 1', undefined]) {
    expect(railPlatformInfo(lineId, platformName)).toEqual({ platform: null, direction: null, confirmed: false });
  }
  expect(normalizeRailPredictions([arrival({ lineId, timestamp: '2026-11-10T11:00:00Z' })], now)).toEqual([]);
});

it("reads the official Windrush New Cross single-letter label", () => {
  expect(railPlatformInfo("windrush", "D")).toEqual({ platform: "D", direction: null, confirmed: true });
});
