import { describe, expect, it } from "vitest";
import { readJourneys, restoreJourney, saveJourney, removeJourney, willReplaceOldest } from "./journeys";

function store() {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_: string, next: string) => { value = next; }, removeItem: () => { value = null; } } as unknown as Storage;
}
function failingStore(journeys: unknown[]) {
  return { getItem: () => JSON.stringify(journeys), setItem: () => { throw new Error("quota exceeded"); }, removeItem: () => {} } as unknown as Storage;
}
const angel = { from: "940GZZLUAGL", to: "940GZZLUACY", fromName: "Angel", toName: "Archway" };
const archway = { from: "940GZZLUACY", to: "940GZZLUBLM", fromName: "Archway", toName: "Balham" };
describe("saved journeys", () => {
  it("keeps MRU and removes duplicates", () => {
    const s = store(); saveJourney(angel, s); saveJourney(archway, s); saveJourney(angel, s);
    expect(readJourneys(s).map((journey) => journey.from)).toEqual([angel.from, archway.from]);
  });
  it("removes malformed or noncanonical storage", () => {
    const s = store(); s.setItem("northern-direct:journeys", "nope"); expect(readJourneys(s)).toEqual([]);
    s.setItem("northern-direct:journeys", JSON.stringify([{ ...angel, from: "bad" }])); expect(readJourneys(s)).toEqual([]);
  });
  it("rebuilds names from canonical station data and drops invalid savedAt", () => {
    const s = store();
    s.setItem("northern-direct:journeys", JSON.stringify([
      { ...angel, fromName: { hostile: true }, toName: ["hostile"], savedAt: "yesterday" },
      { ...archway, fromName: null, toName: { toString: null }, savedAt: Infinity },
    ]));

    expect(readJourneys(s)).toEqual([
      { from: angel.from, to: angel.to, fromName: "Angel", toName: "Archway" },
      { from: archway.from, to: archway.to, fromName: "Archway", toName: "Balham" },
    ]);
  });

  it("preserves finite savedAt values", () => {
    const s = store();
    s.setItem("northern-direct:journeys", JSON.stringify([{ ...angel, savedAt: 123.5 }]));
    expect(readJourneys(s)).toEqual([{ ...angel, savedAt: 123.5 }]);
  });

  it("returns the unchanged list when saving cannot persist", () => {
    const s = failingStore([angel]);
    expect(() => saveJourney(archway, s)).not.toThrow();
    expect(saveJourney(archway, s)).toEqual([angel]);
  });

  it("returns the unchanged list when removing cannot persist", () => {
    const s = failingStore([angel]);
    expect(() => removeJourney(angel, s)).not.toThrow();
    expect(removeJourney(angel, s)).toEqual([angel]);
  });

  it("returns the unchanged list when restoring cannot persist", () => {
    const s = failingStore([angel]);
    expect(() => restoreJourney(archway, 0, s)).not.toThrow();
    expect(restoreJourney(archway, 0, s)).toEqual([angel]);
  });
  it("removes and restores at its former position", () => {
    const s = store(); saveJourney(angel, s); saveJourney(archway, s); removeJourney(archway, s);
    expect(restoreJourney(archway, 0, s)[0]).toMatchObject(archway);
  });
  it("does not request replacement for an existing route", () => {
    const s = store(); saveJourney(angel, s); expect(willReplaceOldest(angel, s)).toBeNull();
  });
  it("returns the oldest route at the capacity boundary", () => {
    const s = store();
    const routes = [
      angel, archway,
      { from: "940GZZLUAGL", to: "940GZZLUBLM", fromName: "Angel", toName: "Balham" },
      { from: "940GZZLUBLM", to: "940GZZLUAGL", fromName: "Balham", toName: "Angel" },
      { from: "940GZZLUACY", to: "940GZZLUBNK", fromName: "Archway", toName: "Bank" },
      { from: "940GZZLUBNK", to: "940GZZLUACY", fromName: "Bank", toName: "Archway" },
      { from: "940GZZLUAGL", to: "940GZZLUBNK", fromName: "Angel", toName: "Bank" },
      { from: "940GZZLUBNK", to: "940GZZLUAGL", fromName: "Bank", toName: "Angel" },
    ];
    for (const route of routes) saveJourney(route, s);
    const next = { from: "940GZZLUCTN", to: "940GZZLUEGW", fromName: "Camden Town", toName: "Edgware" };
    expect(willReplaceOldest(next, s)).toMatchObject(routes[0]);
  });
  it("keeps reverse routes as separate saved journeys", () => {
    const s = store();
    saveJourney(angel, s);
    saveJourney({ ...angel, from: angel.to, to: angel.from, fromName: angel.toName, toName: angel.fromName }, s);
    expect(readJourneys(s)).toHaveLength(2);
  });
});
