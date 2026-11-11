/** Verifies shared station search on native runtimes without ES2023 copying-array methods. */
import { expect, it } from 'vitest';
import { searchStations, stations } from '../../src/lib/northern/stations';

it('searches names and aliases with stable prefix ranking when toSorted is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 'toSorted');
  const canonicalOrder = stations.slice();
  Object.defineProperty(Array.prototype, 'toSorted', { configurable: true, writable: true, value: undefined });
  try {
    expect(searchStations('st').slice(0, 3).map(station => station.name)).toEqual([
      'Stockwell', 'Battersea Power Station', 'East Finchley',
    ]);
    expect(searchStations('Kings Cross').map(station => station.name)).toEqual(["King's Cross St. Pancras"]);
    expect(searchStations('no such station')).toEqual([]);
    expect(searchStations('')).toBe(stations);
    expect(stations).toEqual(canonicalOrder);
  } finally {
    if (original) Object.defineProperty(Array.prototype, 'toSorted', original);
    else Reflect.deleteProperty(Array.prototype, 'toSorted');
  }
});
