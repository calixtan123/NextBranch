import { byId } from '../../src/lib/northern/stations';

export type Direction = 'Northbound' | 'Southbound';
export type Selection = { stationId: string; platform: string; direction: Direction };
export type Catalogue = ReturnType<typeof createCatalogue>;

/** Stable identity for a specific physical platform and direction. */
export function selectionKey(selection: Selection): string {
  return JSON.stringify([selection.stationId, selection.platform, selection.direction]);
}

/** Checks identity shape independently of whether the current catalogue knows the tuple. */
export function readSelection(value: unknown): Selection | null {
  if (!value || typeof value !== 'object') return null;
  const { stationId, platform, direction } = value as Partial<Selection>;
  if (typeof stationId !== 'string' || !byId.has(stationId) ||
      typeof platform !== 'string' || !platform || platform.trim() !== platform ||
      (direction !== 'Northbound' && direction !== 'Southbound')) return null;
  return { stationId, platform, direction };
}

/** Indexes version-one reviewed platform records, dropping invalid and duplicate tuples. */
export function createCatalogue(value: unknown) {
  const source = value as { version?: unknown; platforms?: unknown } | null;
  const records = new Map<string, Selection>();
  if (source?.version === 1 && Array.isArray(source.platforms)) {
    for (const item of source.platforms) {
      const record = readSelection(item);
      if (record) records.set(selectionKey(record), record);
    }
  }
  return {
    has: (selection: Selection) => records.has(selectionKey(selection)),
    at: (stationId: string) => [...records.values()].filter(item => item.stationId === stationId),
  };
}
