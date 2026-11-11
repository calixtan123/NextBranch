/** Native selection identity, legacy recovery and static save eligibility. */
import type { AppStation, Catalogue as SharedCatalogue } from '../../src/lib/catalogue';
import type { CataloguePlatform, CatalogueService } from '../../src/lib/catalogue/schema';
import { serviceCapability } from '../../src/lib/catalogue/capability';

export type Direction = 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound' | '';
export type Selection = { stationId: string; platform: string; direction: Direction; physicalPlatformId?: string };
export type Catalogue = ReturnType<typeof createCatalogue> & { resolve?: (selection: Selection) => Selection; selection?: (station: AppStation, platform: CataloguePlatform) => Selection | null };

/** Stable identity for a specific physical platform and direction. */
export function selectionKey(selection: Selection): string {
  return JSON.stringify(selection.physicalPlatformId ? [selection.stationId, selection.physicalPlatformId] : [selection.stationId, selection.platform, selection.direction]);
}

/** Checks identity shape independently of whether the current catalogue knows the tuple. */
export function readSelection(value: unknown): Selection | null {
  if (!value || typeof value !== 'object') return null;
  const { stationId, platform, direction, physicalPlatformId } = value as Partial<Selection>;
  if (typeof stationId !== 'string' || !stationId || stationId.trim() !== stationId ||
      typeof platform !== 'string' || platform.trim() !== platform ||
      !['Northbound', 'Southbound', 'Eastbound', 'Westbound', ''].includes(direction as string) ||
      (physicalPlatformId !== undefined && (typeof physicalPlatformId !== 'string' || !physicalPlatformId || physicalPlatformId.trim() !== physicalPlatformId)) ||
      (!physicalPlatformId && !platform)) return null;
  return { stationId, platform, direction: direction as Direction, ...(physicalPlatformId ? { physicalPlatformId } : {}) };
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

/**
 * Builds saved-platform identities from published platforms and static reviewed capability.
 *
 * Parameters
 * ----------
 * source : SharedCatalogue
 *     Validated physical-platform catalogue.
 * capability : function, optional
 *     Reviewed service evidence, independent of network availability.
 *
 * Returns
 * -------
 * Catalogue
 *     Selection, migration and eligibility operations.
 */
export function createCanonicalCatalogue(source: SharedCatalogue, capability: typeof serviceCapability = serviceCapability): Catalogue & { selection: (station: AppStation, platform: CataloguePlatform) => Selection | null; resolve: (selection: Selection) => Selection } {
  const selection = (station: AppStation, platform: CataloguePlatform): Selection | null => {
    if (!station.platforms.includes(platform)) return null;
    const eligible = platform.services.some((service: CatalogueService) => {
      const status = capability(station, platform, service);
      return status.feed === 'supported' && status.mapping === 'supported';
    });
    if (!eligible) return null;
    return { stationId: station.station_id, physicalPlatformId: platform.platform_id,
      platform: platform.platform_number, direction: platform.cardinal_direction as Direction };
  };
  const resolve = (item: Selection): Selection => {
    const station = source.stationsByAnyId.get(item.stationId);
    if (!station) return item;
    const matches = station.platforms.filter(p => item.physicalPlatformId ? p.platform_id === item.physicalPlatformId :
      p.platform_number === item.platform && p.cardinal_direction === item.direction &&
      p.services.some(service => service.stop_area_naptan_code === item.stationId || station.station_id === item.stationId));
    if (matches.length !== 1) return item;
    // Identity migration does not require current feed availability or verified matching.
    const platform = matches[0];
    return { stationId: station.station_id, physicalPlatformId: platform.platform_id,
      platform: platform.platform_number, direction: platform.cardinal_direction as Direction };
  };
  return {
    selection, resolve,
    has: item => {
      if (!item.physicalPlatformId) return false;
      const station = source.stationsById.get(item.stationId);
      const platform = station?.platforms.find(p => p.platform_id === item.physicalPlatformId);
      return Boolean(station && platform && selection(station, platform));
    },
    at: stationId => {
      const station = source.stationsByAnyId.get(stationId);
      return station ? station.platforms.flatMap(p => selection(station, p) ?? []) : [];
    },
  };
}
