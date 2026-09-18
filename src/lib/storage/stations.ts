/**
 * Provides defensive, device-local storage for saved and recently used departure stations.
 *
 * The stored envelope deliberately contains only station identity and use metadata. Live
 * predictions belong to the request cache, never to browser persistence.
 */

import { byId } from "../northern/stations";

/** The independently versioned local-storage key for station preferences. */
export const STATIONS_STORAGE_KEY = "northern-direct:stations:v1";

/** The maximum number of distinct saved and recent stations shown to a passenger. */
export const MAX_STATIONS = 5;

/** A canonical station retained as either a saved or recently used departure board. */
export type SavedStation = {
  id: string;
  name: string;
  lastUsedAt: number;
};

/** The versioned storage envelope's two membership lists. */
export type StationCollection = {
  saved: SavedStation[];
  recent: SavedStation[];
};

/** Identifies where a station belongs when an interaction is undone. */
export type StationMembership = "saved" | "recent";

const emptyCollection = (): StationCollection => ({ saved: [], recent: [] });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const compareNewest = (left: SavedStation, right: SavedStation) =>
  right.lastUsedAt - left.lastUsedAt || left.id.localeCompare(right.id);

function canonicalStation(value: unknown): SavedStation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.lastUsedAt !== "number" || !Number.isFinite(value.lastUsedAt)) return null;
  const station = byId.get(value.id);
  return station ? { id: station.id, name: station.name, lastUsedAt: value.lastUsedAt } : null;
}

function canonicalMembership(value: unknown): SavedStation[] {
  if (!Array.isArray(value)) return [];
  const newestById = new Map<string, SavedStation>();
  for (const item of value) {
    const station = canonicalStation(item);
    if (!station) continue;
    const previous = newestById.get(station.id);
    if (!previous || station.lastUsedAt > previous.lastUsedAt) newestById.set(station.id, station);
  }
  return [...newestById.values()].sort(compareNewest);
}

function normalizeCollection(value: unknown): StationCollection {
  if (!isRecord(value)) return emptyCollection();
  const saved = canonicalMembership(value.saved).slice(0, MAX_STATIONS);
  const savedIds = new Set(saved.map((station) => station.id));
  const recent = canonicalMembership(value.recent)
    .filter((station) => !savedIds.has(station.id))
    .slice(0, Math.max(0, MAX_STATIONS - saved.length));
  return { saved, recent };
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads, validates, and canonicalizes the station-preference envelope.
 *
 * Parameters
 * ----------
 * storage : Storage | undefined
 *     Optional browser storage substitute, primarily for isolated tests.
 *
 * Returns
 * -------
 * StationCollection
 *     A bounded, canonical collection. Corrupt or inaccessible storage becomes empty.
 */
export function readStations(storage?: Storage): StationCollection {
  const target = resolveStorage(storage);
  if (!target) return emptyCollection();
  try {
    return normalizeCollection(JSON.parse(target.getItem(STATIONS_STORAGE_KEY) ?? "null"));
  } catch {
    return emptyCollection();
  }
}

/**
 * Writes a canonical station collection without allowing browser-storage errors to stop the UI.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     The next saved/recent membership state to persist.
 * storage : Storage | undefined
 *     Optional browser storage substitute, primarily for isolated tests.
 *
 * Returns
 * -------
 * StationCollection
 *     The normalized next state, even when persistence is unavailable for this browser session.
 */
export function writeStations(collection: StationCollection, storage?: Storage): StationCollection {
  const normalized = normalizeCollection(collection);
  const target = resolveStorage(storage);
  if (!target) return normalized;
  try {
    target.setItem(STATIONS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Local storage is optional: retain usable in-memory interaction state for this page.
  }
  return normalized;
}

/**
 * Produces the bounded row order used by the departure chooser.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Saved and recent station memberships.
 *
 * Returns
 * -------
 * SavedStation[]
 *     Deduplicated saved stations first, followed by recent stations, newest within each group.
 */
export function displayStations(collection: StationCollection): SavedStation[] {
  const normalized = normalizeCollection(collection);
  return [...normalized.saved, ...normalized.recent];
}

/**
 * Records a user-selected departure station while preserving saved membership when applicable.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Current saved and recent memberships.
 * stationId : string
 *     Canonical station identifier selected by the user.
 * lastUsedAt : number
 *     Milliseconds since Unix epoch for deterministic ordering.
 *
 * Returns
 * -------
 * StationCollection
 *     The updated, normalized collection. Invalid IDs or timestamps leave it unchanged.
 */
export function recordRecentStation(collection: StationCollection, stationId: string, lastUsedAt: number): StationCollection {
  const current = normalizeCollection(collection);
  const station = canonicalStation({ id: stationId, lastUsedAt });
  if (!station) return current;
  if (current.saved.some((item) => item.id === station.id)) {
    return normalizeCollection({
      saved: [station, ...current.saved.filter((item) => item.id !== station.id)],
      recent: current.recent,
    });
  }
  return normalizeCollection({
    saved: current.saved,
    recent: [station, ...current.recent.filter((item) => item.id !== station.id)],
  });
}

/**
 * Moves a station into the saved membership and records the current selection time.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Current saved and recent memberships.
 * stationId : string
 *     Canonical station identifier to save.
 * lastUsedAt : number
 *     Milliseconds since Unix epoch for deterministic ordering.
 *
 * Returns
 * -------
 * StationCollection
 *     The updated, normalized collection. Invalid IDs or timestamps leave it unchanged.
 */
export function saveStation(collection: StationCollection, stationId: string, lastUsedAt: number): StationCollection {
  const current = normalizeCollection(collection);
  const station = canonicalStation({ id: stationId, lastUsedAt });
  if (!station) return current;
  return normalizeCollection({
    saved: [station, ...current.saved.filter((item) => item.id !== station.id)],
    recent: current.recent.filter((item) => item.id !== station.id),
  });
}

/**
 * Demotes a saved station to recent while preserving its prior metadata for a possible undo.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Current saved and recent memberships.
 * stationId : string
 *     Canonical station identifier to unsave.
 *
 * Returns
 * -------
 * StationCollection
 *     The updated, normalized collection.
 */
export function unsaveStation(collection: StationCollection, stationId: string): StationCollection {
  const current = normalizeCollection(collection);
  const station = current.saved.find((item) => item.id === stationId);
  if (!station) return current;
  return normalizeCollection({
    saved: current.saved.filter((item) => item.id !== station.id),
    recent: [station, ...current.recent.filter((item) => item.id !== station.id)],
  });
}

/**
 * Removes a station from both saved and recent membership lists.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Current saved and recent memberships.
 * stationId : string
 *     Station identifier to forget.
 *
 * Returns
 * -------
 * StationCollection
 *     The updated, normalized collection.
 */
export function removeStation(collection: StationCollection, stationId: string): StationCollection {
  const current = normalizeCollection(collection);
  return normalizeCollection({
    saved: current.saved.filter((station) => station.id !== stationId),
    recent: current.recent.filter((station) => station.id !== stationId),
  });
}

/**
 * Restores one station to its exact prior membership and metadata after an undo action.
 *
 * Parameters
 * ----------
 * collection : StationCollection
 *     Current saved and recent memberships.
 * station : SavedStation
 *     The pre-action station metadata to restore.
 * membership : StationMembership
 *     The pre-action saved or recent membership to restore.
 *
 * Returns
 * -------
 * StationCollection
 *     The updated, normalized collection.
 */
export function restoreStation(collection: StationCollection, station: SavedStation, membership: StationMembership): StationCollection {
  const current = normalizeCollection(collection);
  const restored = canonicalStation(station);
  if (!restored) return current;
  const saved = current.saved.filter((item) => item.id !== restored.id);
  const recent = current.recent.filter((item) => item.id !== restored.id);
  return membership === "saved"
    ? normalizeCollection({ saved: [restored, ...saved], recent })
    : normalizeCollection({ saved, recent: [restored, ...recent] });
}
