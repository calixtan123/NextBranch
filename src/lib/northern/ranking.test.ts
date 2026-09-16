import { describe, expect, it } from "vitest";
import { rankTrains } from "./ranking";
import type { Train } from "./predictions";
const make = (
  id: string,
  origin: number,
  eta: number | null,
  evidence: Train["evidence"] = "live",
): Train => ({
  id,
  vehicleId: "1",
  lineId: "northern",
  canonicalTerminus: "t",
  destinationName: null,
  expectedArrival: "2026-01-01T00:00:00.000Z",
  timestamp: "2026-01-01T00:00:00.000Z",
  secondsToOrigin: origin,
  platform: null,
  direction: null,
  platformConfirmed: false,
  branch: null,
  towards: null,
  routeConfidence: "confirmed",
  servicePatternId: "p",
  destinationArrival: eta === null ? null : "2026-01-01T00:00:00.000Z",
  destinationSeconds: eta,
  evidence,
  strength: evidence,
  via: null,
});
describe("ranking", () => {
  it("returns null when every ETA is absent", () =>
    expect(rankTrains([make("a", 10, null)]).qualification).toBeNull());
  it("marks incomplete ETA evidence fastest_known", () =>
    expect(
      rankTrains([make("a", 10, 100), make("b", 20, null)]).qualification,
    ).toBe("fastest_known"));
  it("ties deterministically", () =>
    expect(
      rankTrains([make("b", 10, 100), make("a", 10, 100)]).nextTrainId,
    ).toBe("a"));
});
