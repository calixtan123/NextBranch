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
