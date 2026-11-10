/** Canonical selection, migration and wire-contract regressions. */
import { expect, it } from 'vitest';
import { catalogue as shared } from '../../src/lib/catalogue';
import { createCanonicalCatalogue, selectionKey } from '../src/catalogue';
import { createPreferences } from '../src/preferences';
import { decodeSnapshot } from '../src/api';

it('migrates an unambiguous tuple, deduplicates its canonical identity and retains removed tuples across reload', async () => {
  const station = shared.stationsByAnyId.get('940GZZLUCND')!;
  const platform = station.platforms.find(p => p.platform_number === '1')!;
  const catalogue = createCanonicalCatalogue(shared);
  const canonical = catalogue.selection(station, platform)!;
  let raw = JSON.stringify({ version: 1, cards: [ { stationId: '940GZZLUCND', platform: '1', direction: 'Northbound', style: 'modern' }, canonical, { stationId: 'removed', platform: '9', direction: 'Eastbound' } ] });
  const storage = { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } };
  const owner = createPreferences(storage, catalogue);
  await owner.load();
  expect(owner.get().cards).toHaveLength(2);
  expect(selectionKey(owner.get().cards[0])).toBe(selectionKey(canonical));
  expect(owner.get().cards[0].style).toBe('modern');
  expect(owner.get().cards[1].stationId).toBe('removed');
  owner.setMode('modern'); await owner.flush();
  const restored = createPreferences(storage, catalogue); await restored.load();
  expect(restored.get().cards).toEqual(owner.get().cards);
});

it('retains additive platform and catalogue metadata from the API', () => {
  const value = { station: { id: 's', name: 'Station' }, observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null,
    platforms: [{ platform: null, direction: null, physicalPlatformId: 'p', departures: [] }],
    catalogue: { stationId: 's', liveState: 'empty', platforms: [] } };
  expect(decodeSnapshot(value, 's')).toMatchObject(value);
});

it('allows verified unknown directions independently of live snapshots and excludes unverified services', () => {
  const station = shared.stationsByAnyId.get('940GZZLUCND')!;
  const platform = { ...station.platforms[0], cardinal_direction: '' as const };
  const synthetic = { ...station, platforms: [platform] };
  const supported = createCanonicalCatalogue(shared, () => ({ feed: 'supported', mapping: 'supported', evidence: 'synthetic test evidence' }));
  const unverified = createCanonicalCatalogue(shared, () => ({ feed: 'supported', mapping: 'unverified', evidence: 'unverified' }));
  expect(supported.selection(synthetic, platform)).toMatchObject({ direction: '', physicalPlatformId: platform.platform_id });
  expect(unverified.selection(synthetic, platform)).toBeNull();
});

it('matches canonical boards by physical identity rather than tuple or another platform', async () => {
  const { boardRows } = await import('../src/board-model');
  const selection = { stationId: 's', platform: '1', direction: 'Northbound' as const, physicalPlatformId: 'p' };
  const departure = { id: 'train', destinationName: 'Bank', expectedArrival: '2026-01-01T00:01:00Z', secondsToStation: 60, towards: null };
  const base = { station: { id: 's', name: 'Station' }, observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30 };
  const snapshot = { ...base, platforms: [{ platform: 'wrong', direction: null, physicalPlatformId: 'p', departures: [departure] }, { platform: '1', direction: 'Northbound' as const, physicalPlatformId: 'other', departures: [{ ...departure, id: 'wrong' }] }] };
  expect(boardRows(snapshot, selection, Date.parse(base.observedAt), 3).map(row => row.id)).toEqual(['train']);
});

it('does not count a verified physical platform with unknown direction as unassigned', async () => {
  const { unassignedCount } = await import('../src/board-model');
  const snapshot = decodeSnapshot({ station: { id: 's', name: 'Station' }, observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null,
    platforms: [{ platform: null, direction: null, physicalPlatformId: 'p', departures: [{ id: 't', destinationName: null, expectedArrival: '2026-01-01T00:01:00Z', secondsToStation: 60, towards: null }] }] }, 's');
  expect(unassignedCount(snapshot, Date.parse(snapshot.observedAt))).toBe(0);
});

it('saves and reloads a synthetic verified unknown-direction physical platform', async () => {
  const original = shared.stationsByAnyId.get('940GZZLUCND')!;
  const platform = { ...original.platforms[0], cardinal_direction: '' as const };
  const station = { ...original, platforms: [platform] };
  const source = { ...shared, stationsByAnyId: new Map([[station.station_id, station]]), stationsById: new Map([[station.station_id, station]]) };
  const catalogue = createCanonicalCatalogue(source, () => ({ feed: 'supported', mapping: 'supported', evidence: 'synthetic evidence' }));
  let raw: string | null = null;
  const storage = { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } };
  const owner = createPreferences(storage, catalogue); await owner.load();
  const selection = catalogue.selection(station, platform)!;
  expect(owner.save(selection)).toBe('saved'); await owner.flush();
  const restored = createPreferences(storage, catalogue); await restored.load();
  expect(restored.get().cards).toMatchObject([selection]);
  expect(catalogue.has(restored.get().cards[0])).toBe(true);
});

it.each(['Northbound', 'Southbound', 'Eastbound', 'Westbound'] as const)('preserves line identity and %s through native decoding and a canonical board', async direction => {
  const { boardRows } = await import('../src/board-model');
  const snapshot = decodeSnapshot({ station: { id: 's', name: 'Station' }, observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null,
    platforms: [{ platform: '1', direction, physicalPlatformId: 'p', departures: [{ id: 't', lineId: 'central', destinationName: null, expectedArrival: '2026-01-01T00:01:00Z', secondsToStation: 60, towards: null }] }] }, 's');
  expect(snapshot.platforms[0].direction).toBe(direction);
  expect(boardRows(snapshot, { stationId: 's', platform: '1', direction, physicalPlatformId: 'p' }, Date.parse(snapshot.observedAt), 3)[0].lineId).toBe('central');
});

it('allows partial coverage but leaves wholly unverified platforms unsavable', () => {
  const station = shared.stationsById.get('HUBKWG')!;
  const platform = station.platforms[0];
  const partiallyVerified = createCanonicalCatalogue(shared, (_s, _p, service) => service.line_id === 'district'
    ? { feed: 'supported', mapping: 'supported', evidence: 'synthetic' }
    : { feed: 'unverified', mapping: 'unverified', evidence: 'synthetic' });
  const unverified = createCanonicalCatalogue(shared, () => ({ feed: 'supported', mapping: 'unverified', evidence: 'synthetic' }));
  expect(partiallyVerified.selection(station, platform)?.physicalPlatformId).toBe(platform.platform_id);
  expect(unverified.selection(station, platform)).toBeNull();
});

it('retains an ambiguous legacy tuple without guessing a physical platform', async () => {
  const original = shared.stationsByAnyId.get('940GZZLUCND')!;
  const platform = original.platforms[0];
  const station = { ...original, platforms: [platform, { ...platform, platform_id: 'ambiguous' }] };
  const source = { ...shared, stationsByAnyId: new Map([[station.station_id, station]]), stationsById: new Map([[station.station_id, station]]) };
  const catalogue = createCanonicalCatalogue(source);
  const legacy = { stationId: station.station_id, platform: platform.platform_number, direction: platform.cardinal_direction };
  expect(catalogue.resolve(legacy)).toEqual(legacy);
  expect(catalogue.has(legacy)).toBe(false);
});

it('rejects saving a platform when all synthetic service capabilities are unsupported', async () => {
  const station = shared.stationsById.get('HUBKWG')!;
  const platform = station.platforms[0];
  const catalogue = createCanonicalCatalogue(shared, () => ({
    feed: 'unsupported', mapping: 'unsupported', evidence: 'Synthetic unsupported feed evidence for this test',
  }));
  const preferences = createPreferences({ getItem: async () => null, setItem: async () => undefined }, catalogue);
  await preferences.load();
  const candidate = { stationId: station.station_id, physicalPlatformId: platform.platform_id,
    platform: platform.platform_number, direction: platform.cardinal_direction };

  expect(catalogue.selection(station, platform)).toBeNull();
  expect(preferences.save(candidate)).toBe('invalid');
  expect(preferences.get().cards).toEqual([]);
});
