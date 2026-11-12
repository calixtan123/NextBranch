import { expect, it, vi } from 'vitest';
import { searchStations } from '../../src/lib/northern/stations';
import { londonTime } from '../../src/lib/northern/time';
import { createCatalogue } from '../src/catalogue';
import { boardRows } from '../src/board-model';
import { fixtureRuntime } from '../src/fixture';

const colindale = '940GZZLUCND';
const camden = '940GZZLUCTN';
const signal = new AbortController().signal;

it('uses canonical aliases offline and does not infer platform choices from station metadata', () => {
  expect(searchStations('Kings Cross').map(station => station.id)).toEqual(['940GZZLUKSX']);
  expect(searchStations('Battersea').map(station => station.name)).toEqual(['Battersea Power Station']);
  expect(searchStations('xyz')).toEqual([]);
  const catalogue = createCatalogue({ version: 1, platforms: [
    { stationId: colindale, platform: '4', direction: 'unknown' },
    { stationId: camden, platform: ' 1 ', direction: 'Southbound' },
  ] });
  expect(catalogue.at(colindale)).toEqual([]);
  expect(catalogue.at(camden)).toEqual([]);
});

it('keeps fixture transport isolated for unknown stations and for an independent Camden failure', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  try {
    const runtime = fixtureRuntime('camden-outage', true);
    expect(runtime.cards).toHaveLength(3);
    await expect(runtime.transport('940GZZLUHBT', signal)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(runtime.transport(camden, signal)).resolves.toMatchObject({ station: { id: camden } });
    await expect(runtime.transport(camden, signal)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(runtime.transport(colindale, signal)).resolves.toMatchObject({ station: { id: colindale } });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('replays a fresh empty exact platform with the other platform intact and London summer time', async () => {
  const runtime = fixtureRuntime('empty-camden-a', false);
  expect(runtime.cards).toEqual([]);
  const [a, b] = runtime.catalogue.at(camden);
  const snapshot = await runtime.transport(camden, signal);
  expect(boardRows(snapshot, a, runtime.now(), 5)).toEqual([]);
  expect(boardRows(snapshot, b, runtime.now(), 5)).toHaveLength(3);
  expect(londonTime(new Date(runtime.now()).toISOString())).toBe('13:00');
  expect(londonTime('2026-11-09T12:00:00Z')).toBe('12:00');
});

it('replays one, two and three rows before refresh grows wrapped arrival surfaces', async () => {
  const runtime = fixtureRuntime('board-growth', true);
  const firstColindale = await runtime.transport(colindale, signal);
  const firstCamden = await runtime.transport(camden, signal);
  expect(runtime.cards.map(card => boardRows(card.stationId === colindale ? firstColindale : firstCamden,
    card, runtime.now(), 3).length)).toEqual([1, 2, 3]);
  const grownColindale = await runtime.transport(colindale, signal);
  const grownCamden = await runtime.transport(camden, signal);
  expect(boardRows(grownColindale, runtime.cards[0], runtime.now(), 3)).toHaveLength(3);
  expect(boardRows(grownCamden, runtime.cards[1], runtime.now(), 5)).toHaveLength(5);
  expect(grownCamden.platforms[0].departures[0].towards).toContain('Charing Cross');
  const ordinary = fixtureRuntime('three-card-home', true);
  expect(boardRows(await ordinary.transport(colindale, signal), ordinary.cards[0], ordinary.now(), 3)).toHaveLength(3);
});

it('isolates synthetic glyph readability specimens while preserving ordinary fixture rows', async () => {
  const runtime = fixtureRuntime('glyph-readability', true);
  expect(runtime.synthetic).toBe(true);
  expect(runtime.cards).toHaveLength(3);
  const longStation = runtime.cards[0];
  expect(longStation.stationId).toBe('940GZZLUKSX');
  expect(runtime.catalogue.has(longStation)).toBe(true);
  const snapshot = await runtime.transport(longStation.stationId, signal);
  expect(snapshot.station.name).toBe("King's Cross St. Pancras");
  expect(boardRows(snapshot, longStation, runtime.now(), 5).map(row => row.destination)).toEqual([
    'Morden via Bank', 'Kennington via Charing Cross', 'Hammersmith (Hammersmith & City)',
    'King’s Cross/St. Pancras', 'Supercalifragilisticexpialidocious',
  ]);
  await expect(runtime.transport('unknown', signal)).rejects.toMatchObject({ kind: 'unavailable' });
  const ordinary = fixtureRuntime('three-card-home', true);
  expect(ordinary.cards[0].stationId).toBe(colindale);
  expect((await ordinary.transport(camden, signal)).platforms[0].departures[0].destinationName)
    .not.toBe('Morden via Bank');
});

it('replays exact freshness boundaries and physical platform identities for native status capture', async () => {
  const runtime = fixtureRuntime('status-age', true);
  const fresh = await runtime.transport(colindale, signal);
  const stale = await runtime.transport(camden, signal);
  expect(runtime.now() - Date.parse(fresh.observedAt)).toBe(30_000);
  expect(runtime.now() - Date.parse(stale.observedAt)).toBe(30_001);
  expect(runtime.cards.every(card => Boolean(card.physicalPlatformId))).toBe(true);
  expect(boardRows(fresh, runtime.cards[0], runtime.now(), 3)).toHaveLength(3);
});

it('replays relevant and unrelated feed failures independently', async () => {
  const runtime = fixtureRuntime('status-partial', true);
  const relevant = await runtime.transport(camden, signal);
  const unrelated = await runtime.transport(colindale, signal);
  expect(relevant.catalogue?.feeds).toContainEqual({ lineId: 'northern', stopAreaId: camden, liveState: 'unavailable' });
  expect(unrelated.catalogue?.feeds).toContainEqual({ lineId: 'district', stopAreaId: '940GZZLUACT', liveState: 'unavailable' });
});

it('replays cached request failure followed by successful recovery', async () => {
  const runtime = fixtureRuntime('status-recovery', true);
  await expect(runtime.transport(camden, signal)).resolves.toMatchObject({ station: { id: camden } });
  await expect(runtime.transport(camden, signal)).rejects.toMatchObject({ kind: 'unavailable' });
  const recovered = await runtime.transport(camden, signal);
  expect(recovered.observedAt).toBe(new Date(runtime.now()).toISOString());
});

it('keeps the initial status loading window deterministic before a successful response', async () => {
  vi.useFakeTimers();
  try {
    const runtime = fixtureRuntime('status-loading', true);
    let settled = false;
    const response = runtime.transport(colindale, signal).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(response).resolves.toMatchObject({ station: { id: colindale } });
  } finally {
    vi.useRealTimers();
  }
});
