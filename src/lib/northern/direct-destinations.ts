import { directDestinationIds } from "./direct-destination-map";
import { byId, stations, type Station } from "./stations";

/** Application-level, sanitised destination lookup. Components never inspect TfL topology. */
export function directDestinations(origin: Station | null): readonly Station[] {
  if (!origin) return stations;
  const ids = directDestinationIds[origin.id] ?? [];
  return [...ids].flatMap((id) => byId.get(id) ?? []).filter((station) => station.id !== origin.id).toSorted((a, b) => a.name.localeCompare(b.name));
}
