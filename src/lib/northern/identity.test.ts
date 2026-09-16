import { describe, expect, it } from "vitest";
import { dedupe, identity } from "./identity";

describe("prediction identity", () => {
  it("prefers a non-empty upstream ID and never uses vehicle alone", () => {
    expect(identity({ id: "upstream-7", vehicleId: "1" })).toBe("upstream-7");
    expect(identity({ vehicleId: "1", origin: "a", destinationNaptanId: "b", expectedArrival: "x" })).not.toBe("1");
  });
  it("produces a deterministic reduced hash when identity is absent", () => {
    const input = { origin: "a", vehicleId: null as unknown as string, destinationNaptanId: "b", expectedArrival: "x" };
    expect(identity(input)).toBe(identity(input));
    expect(identity(input)).toHaveLength(64);
  });
  it("deduplicates exact identity only", () => {
    expect(dedupe([{ id: "a" }, { id: "a" }, { id: "b" }])).toHaveLength(2);
    expect(dedupe([{ id: "a", expectedArrival: "x" }, { id: "b", expectedArrival: "x" }])).toHaveLength(2);
  });
});
