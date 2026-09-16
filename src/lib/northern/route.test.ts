import { describe, expect, it } from "vitest";
import {
  candidateForRoute,
  platformInfo,
  selectSuitable,
  normalizeTowards,
} from "./route";
const route = {
  id: "bank",
  branch: "bank",
  stations: [{ id: "o" }, { id: "d" }, { id: "940GZZLUHBT" }],
};
describe("Northern route safety", () => {
  it("treats all true candidates as suitable", () => {
    const candidates = [candidateForRoute(route, "o", "d"), candidateForRoute(route, "o", "d")];
    expect(selectSuitable(candidates, "o", "d")).toMatchObject({ suitable: true, withheld: false });
  });
  it("treats all false candidates as known unsuitable", () => {
    const candidates = [
      { ...candidateForRoute(route, "o", "940GZZLUHBT"), servesDestination: false as const },
      { ...candidateForRoute(route, "o", "940GZZLUHBT"), servesDestination: false as const },
    ];
    expect(selectSuitable(candidates, "o", "d")).toMatchObject({ suitable: false, confidence: "confirmed", withheld: false });
  });
  it("slices a short turn at advertised terminus", () =>
    expect(candidateForRoute(route, "o", "d", "940GZZLUHBT").servesDestination).toBe(
      true,
    ));
  it("withholds disagreement", () =>
    expect(
      selectSuitable(
        [
          { ...candidateForRoute(route, "o", "d"), servesDestination: true },
          { ...candidateForRoute(route, "o", "d"), servesDestination: false },
        ],
        "o",
        "d",
      ).withheld,
    ).toBe(true));
  it("does not guess a branch when inferred candidates disagree", () => {
    const bank = {
      ...candidateForRoute(
        { ...route, id: "bank-pattern", branch: "bank" },
        "o",
        "d",
      ),
      servesDestination: true as const,
    };
    const cx = {
      ...candidateForRoute(
        { ...route, id: "cx-pattern", branch: "cx" },
        "o",
        "d",
      ),
      servesDestination: true as const,
    };
    expect(selectSuitable([bank, cx], "o", "d")).toMatchObject({
      suitable: true,
      confidence: "inferred",
      candidate: { branch: null, servicePatternId: null },
    });
  });
  it("withholds unknown and unmappable trains", () => {
    expect(selectSuitable([{ ...candidateForRoute(route, "missing", "d") }], "o", "d").withheld).toBe(true);
    expect(selectSuitable([], "o", "d")).toMatchObject({ confidence: "unknown", withheld: true });
  });
  it("normalizes only discovery-backed branch hints", () => {
    expect(normalizeTowards("Edgware via CX")).toBe("940GZZLUCHX");
    expect(normalizeTowards("Morden via Bank")).toBe("940GZZLUBNK");
    expect(normalizeTowards("Edgware")).toBe(null);
  });
});
describe("platform", () => {
  it("requires exact platform syntax", () => {
    expect(platformInfo("Northbound - Platform 2")).toMatchObject({
      direction: "Northbound",
      platform: "2",
      confirmed: true,
    });
    expect(platformInfo("Platform 2")).toMatchObject({
      platform: null,
      confirmed: false,
    });
    expect(platformInfo("Northbound Platform 2")).toMatchObject({
      platform: null,
      confirmed: false,
    });
    expect(platformInfo(undefined, "outbound")).toMatchObject({
      direction: "Northbound",
      platform: null,
      confirmed: false,
    });
  });
});
