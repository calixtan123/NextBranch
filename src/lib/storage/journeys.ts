import type { Journey } from "../journeys/types";
import { byId } from "../northern/stations";
export const JOURNEYS_STORAGE_KEY = "northern-direct:journeys";
const MAX = 8;
const listeners = new Set<() => void>();
const same = (a: Journey, b: Journey) => a.from === b.from && a.to === b.to;
const valid = (item: unknown): item is Journey => {
  if (!item || typeof item !== "object") return false;
  const journey = item as Journey;
  return typeof journey.from === "string" && typeof journey.to === "string" && byId.has(journey.from) && byId.has(journey.to) && journey.from !== journey.to;
};
function canonical(item: Journey): Journey {
  const result: Journey = {
    from: item.from,
    to: item.to,
    fromName: byId.get(item.from)!.name,
    toName: byId.get(item.to)!.name,
  };
  if (typeof item.savedAt === "number" && Number.isFinite(item.savedAt)) result.savedAt = item.savedAt;
  return result;
}
function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
function notify() { for (const listener of listeners) listener(); }
export function subscribeJourneys(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function readJourneys(storage?: Storage): Journey[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const data: unknown = JSON.parse(target.getItem(JOURNEYS_STORAGE_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter(valid).map(canonical).slice(0, MAX) : [];
  } catch { return []; }
}
export function willReplaceOldest(journey: Journey, storage?: Storage): Journey | null {
  const current = readJourneys(storage); return current.some((item) => same(item, journey)) || current.length < MAX ? null : (current.at(-1) ?? null);
}
export function saveJourney(journey: Journey, storage?: Storage) {
  const target = getStorage(storage); if (!target) return readJourneys();
  const current = readJourneys(storage);
  const next = [canonical({ ...journey, savedAt: Date.now() }), ...current.filter((item) => !same(item, journey))].slice(0, MAX);
  try { target.setItem(JOURNEYS_STORAGE_KEY, JSON.stringify(next)); notify(); return next; } catch { return current; }
}
export function removeJourney(journey: Journey, storage?: Storage) {
  const target = getStorage(storage); if (!target) return readJourneys();
  const current = readJourneys(storage);
  const next = current.filter((item) => !same(item, journey));
  try { target.setItem(JOURNEYS_STORAGE_KEY, JSON.stringify(next)); notify(); return next; } catch { return current; }
}
export function restoreJourney(journey: Journey, index: number, storage?: Storage) {
  const target = getStorage(storage); if (!target) return readJourneys();
  const current = readJourneys(storage);
  const without = current.filter((item) => !same(item, journey));
  const next = [...without.slice(0, index), canonical(journey), ...without.slice(index)].slice(0, MAX);
  try { target.setItem(JOURNEYS_STORAGE_KEY, JSON.stringify(next)); notify(); return next; } catch { return current; }
}
