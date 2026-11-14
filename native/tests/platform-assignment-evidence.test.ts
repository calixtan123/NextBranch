/** Replays captured exact feeds through dedupe, physical assignment and native boards. */
import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDeparturesHandler } from '../../src/app/api/departures/route';
import { catalogue } from '../../src/lib/catalogue';
import { physicalPlatformForTrain } from '../../src/lib/catalogue/capability';
import { parseArrivals } from '../../src/lib/northern/schemas';
import { normalizeRailPredictions } from '../../src/lib/rail/departures';
import kew from '../../data/tfl-shared-kew-fixtures.json';
import elizabeth from '../../data/tfl-elizabeth-fixtures.json';
import tram from '../../data/tfl-tram-cable-fixtures.json';
import { decodeSnapshot } from '../src/api';
import { boardRows, unassignedCount } from '../src/board-model';
import type { Direction } from '../src/catalogue';

const fixtures = [...kew.feeds, ...elizabeth.feeds, ...tram.feeds];

it.each([
  ['HUBKWG', 'district', 1, 1, 0],
  ['HUBKWG', 'mildmay', 17, 6, 11],
  ['HUBABW', 'elizabeth', 32, 32, 0],
  ['HUBEAL', 'elizabeth', 41, 41, 0],
  ['940GZZCRADD', 'tram', 8, 8, 0],
  ['HUBECY', 'tram', 9, 0, 9],
  ['HUBELM', 'tram', 2, 0, 2],
  ['940GZZALGWP', 'london-cable-car', 0, 0, 0],
] as const)('preserves the captured %s/%s assignment and visible-row trace', async (stationId, lineId, currentCount, mappedCount, unknownCount) => {
  const feed = fixtures.find(item => item.stationId === stationId && item.lineId === lineId)!;
  const station = catalogue.stationsById.get(stationId)!;
  const now = new Date(feed.observedAt);
  const raw = parseArrivals(feed.predictions);
  const exact = raw.filter(row => row.lineId === feed.lineId && row.naptanId === feed.stopAreaId);
  const current = normalizeRailPredictions(exact, now);
  expect(current).toHaveLength(currentCount);
  expect(normalizeRailPredictions([...exact, ...exact], now)).toEqual(current);
  expect(current.filter(train => physicalPlatformForTrain(station, train))).toHaveLength(mappedCount);

  const get = createDeparturesHandler({ now: () => now, lineArrivals: async (line, stop) =>
    line === feed.lineId && stop === feed.stopAreaId ? [...raw, ...raw] : [] });
  const response = await get(new Request('http://local/api/departures?station=' + stationId));
  expect(response.status).toBe(200);
  const snapshot = decodeSnapshot(await response.json(), stationId);
  expect(snapshot.platforms.flatMap(group => group.departures)).toHaveLength(currentCount);
  expect(unassignedCount(snapshot, now.getTime())).toBe(unknownCount);
  for (const platform of station.platforms) {
    const selection = { stationId, physicalPlatformId: platform.platform_id,
      platform: platform.platform_number, direction: platform.cardinal_direction as Direction };
    const matching = current.filter(train => physicalPlatformForTrain(station, train) === platform.platform_id);
    for (const limit of [3, 5] as const) {
      const rows = boardRows(snapshot, selection, now.getTime(), limit);
      expect(rows).toHaveLength(Math.min(matching.length, limit));
      expect(rows.every(row => matching.some(train => train.id === row.id))).toBe(true);
    }
  }
});
