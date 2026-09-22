/** Verifies canonical, bounded, and failure-tolerant departure-station storage. */

import { describe, expect, it } from "vitest";
import {
  STATIONS_STORAGE_KEY,
  displayStations,
  readStations,
  recordRecentStation,
  removeStation,
  restoreStation,
  saveStation,
  unsaveStation,
  writeStations,
  type StationCollection,
} from "./stations";

const camden = { id: "940GZZLUCTN", name: "Camden Town", lastUsedAt: 50 };
const angel = { id: "940GZZLUAGL", name: "Angel", lastUsedAt: 40 };
const archway = { id: "940GZZLUACY", name: "Archway", lastUsedAt: 30 };
const balham = { id: "940GZZLUBLM", name: "Balham", lastUsedAt: 20 };
const bank = { id: "940GZZLUBNK", name: "Bank", lastUsedAt: 10 };
const edgware = { id: "940GZZLUEGW", name: "Edgware", lastUsedAt: 5 };

function store(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: () => { value = null; },
  } as unknown as Storage;
}

describe("saved and recent departure stations", () => {
  // Break: a renamed or malformed browser record can become an invalid station control.
  it("canonicalizes valid station records, drops malformed data, and gives saved membership precedence", () => {
    const source = store(JSON.stringify({
      saved: [
        { id: camden.id, name: { hostile: true }, lastUsedAt: 10 },
        { ...angel, lastUsedAt: Number.POSITIVE_INFINITY },
        { id: "obsolete", name: "No longer here", lastUsedAt: 80 },
        { ...camden, lastUsedAt: 60 },
      ],
      recent: [
        { ...camden, name: "Wrong duplicate", lastUsedAt: 999 },
        { ...archway, name: ["Wrong name"], lastUsedAt: 30 },
        { ...balham, lastUsedAt: "yesterday" },
      ],
    }));

    expect(readStations(source)).toEqual({
      saved: [{ id: camden.id, name: "Camden Town", lastUsedAt: 60 }],
      recent: [{ id: archway.id, name: "Archway", lastUsedAt: 30 }],
    });
  });

  // Break: independently bounded arrays can expose more than five stations or put recent choices ahead of saves.
  it("presents at most five stations with saved rows first and newest timestamps within each membership", () => {
    const collection: StationCollection = {
      saved: [bank, camden],
      recent: [archway, angel, balham, edgware],
    };

    expect(displayStations(collection)).toEqual([
      camden,
      bank,
      angel,
      archway,
      balham,
    ]);
  });

  // Break: using, saving, unsaving, removing, or undoing a station loses its membership or the original use timestamp.
  it("moves stations between memberships and restores the exact prior membership metadata", () => {
    const initial: StationCollection = { saved: [camden], recent: [angel, archway] };
    const used = recordRecentStation(initial, angel.id, 75);
    const saved = saveStation(used, angel.id, 80);
    const unsaved = unsaveStation(saved, angel.id);
    const removed = removeStation(unsaved, angel.id);
    const restored = restoreStation(removed, { id: angel.id, name: "Changed name", lastUsedAt: 80 }, "recent");

    expect(used).toEqual({ saved: [camden], recent: [{ ...angel, lastUsedAt: 75 }, archway] });
    expect(saved).toEqual({ saved: [{ ...angel, lastUsedAt: 80 }, camden], recent: [archway] });
    expect(unsaved).toEqual({ saved: [camden], recent: [{ ...angel, lastUsedAt: 80 }, archway] });
    expect(removed).toEqual({ saved: [camden], recent: [archway] });
    expect(restored).toEqual({ saved: [camden], recent: [{ ...angel, lastUsedAt: 80 }, archway] });
  });

  // Break: normal capacity truncation drops an old restored row after a replacement station fills its former slot.
  it("keeps a restored station at capacity by evicting the lowest-priority non-restored row", () => {
    const initial: StationCollection = { saved: [], recent: [camden, angel, archway, balham, bank] };
    const removed = removeStation(initial, bank.id);
    const withReplacement = recordRecentStation(removed, edgware.id, 60);

    expect(restoreStation(withReplacement, bank, "recent")).toEqual({
      saved: [],
      recent: [{ ...edgware, lastUsedAt: 60 }, camden, angel, archway, bank],
    });
  });

  // Break: storage failures throw into the departure screen or write non-station live payloads.
  it("uses a versioned envelope, keeps only station data, and tolerates denied storage access", () => {
    const persisted = store();
    const collection = saveStation({ saved: [], recent: [camden] }, camden.id, 100);
    expect(writeStations(collection, persisted)).toEqual({ saved: [{ ...camden, lastUsedAt: 100 }], recent: [] });
    expect(JSON.parse(persisted.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({
      saved: [{ ...camden, lastUsedAt: 100 }],
      recent: [],
    });

    const denied = {
      getItem: () => { throw new Error("storage disabled"); },
      setItem: () => { throw new Error("storage disabled"); },
      removeItem: () => { throw new Error("storage disabled"); },
    } as unknown as Storage;
    expect(() => readStations(denied)).not.toThrow();
    expect(readStations(denied)).toEqual({ saved: [], recent: [] });
    expect(() => writeStations(collection, denied)).not.toThrow();
    expect(writeStations(collection, denied)).toEqual({ saved: [{ ...camden, lastUsedAt: 100 }], recent: [] });
  });
});
