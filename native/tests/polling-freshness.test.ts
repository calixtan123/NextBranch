/** Controlled-clock freshness policy regressions across successful and overdue polls. */
import { afterEach, expect, it, vi } from 'vitest';
import camden from '../assets/camden-mixed.json';
import { responseAge } from '../../src/lib/northern/response-time';
import { decodeSnapshot, type StationTransport } from '../src/api';
import { boardStatus } from '../src/board-model';
import { createStationOwner, isStale } from '../src/station-owner';

const id = camden.station.id;
const server = Date.parse(camden.observedAt);
afterEach(() => vi.useRealTimers());

it.each([0, 10_000, 15_000])('keeps repeated successful polls fresh with %s ms cached age and nonzero request latency', async cacheAge => {
  vi.useFakeTimers();
  const starts: number[] = [];
  const transport: StationTransport = async () => {
    const startedAt = performance.now();
    starts.push(startedAt);
    await new Promise(resolve => setTimeout(resolve, 5_000));
    const fetchedAt = new Date(server + startedAt - cacheAge).toISOString();
    return decodeSnapshot({ ...camden, observedAt: fetchedAt,
      generatedAt: new Date(server + startedAt).toISOString(),
      catalogue: { stationId: id, liveState: 'available', platforms: [],
        feeds: [{ lineId: 'northern', stopAreaId: id, liveState: 'available', fetchedAt }] },
    }, id);
  };
  const owner = createStationOwner(transport);
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(5_000);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const previous = owner.get(id).snapshot!;
      expect(responseAge(previous, performance.now())).toBe(cacheAge + 5_000);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(owner.get(id).pending).toBe(false);
      expect(isStale(owner.get(id), performance.now(), true)).toBe(false);
      expect(boardStatus(owner.get(id), performance.now(), true).tone).toBe('success');
      await vi.advanceTimersByTimeAsync(1);
      expect(owner.get(id).pending).toBe(true);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(owner.get(id).snapshot).toBe(previous);
      expect(responseAge(previous, performance.now())).toBe(cacheAge + 39_999);
      expect(boardStatus(owner.get(id), performance.now(), true).tone).toBe('success');
      await vi.advanceTimersByTimeAsync(1);
      expect(owner.get(id).snapshot).not.toBe(previous);
      expect(isStale(owner.get(id), performance.now(), true)).toBe(false);
    }
    expect(starts).toEqual([0, 35_000, 70_000, 105_000]);
  } finally { owner.dispose(); }
});

it('keeps the exact cached-age boundary fresh and becomes stale one millisecond later', async () => {
  vi.useFakeTimers();
  const fetchedAt = new Date(server - 55_000).toISOString();
  const owner = createStationOwner(async () => {
    await new Promise(resolve => setTimeout(resolve, 5_000));
    return decodeSnapshot({ ...camden, observedAt: fetchedAt, generatedAt: camden.observedAt }, id);
  });
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(owner.get(id).snapshot?.observedAt).toBe(fetchedAt);
    expect(responseAge(owner.get(id).snapshot!, performance.now())).toBe(60_000);
    expect(isStale(owner.get(id), performance.now(), true)).toBe(false);
    expect(boardStatus(owner.get(id), performance.now(), true)).toEqual({ tone: 'success', label: 'Live departures up to date' });
    await vi.advanceTimersByTimeAsync(1);
    expect(isStale(owner.get(id), performance.now(), true)).toBe(true);
    expect(boardStatus(owner.get(id), performance.now(), true)).toEqual({ tone: 'warning', label: 'Departures are over 60 seconds old' });
  } finally { owner.dispose(); }
});

it('shows genuinely overdue data during a slow successful poll and recovers when it completes', async () => {
  vi.useFakeTimers();
  let request = 0;
  const owner = createStationOwner(async () => {
    const startedAt = performance.now();
    request += 1;
    await new Promise(resolve => setTimeout(resolve, request === 1 ? 5_000 : 19_000));
    return decodeSnapshot({ ...camden,
      observedAt: new Date(server + startedAt - 15_000).toISOString(),
      generatedAt: new Date(server + startedAt).toISOString() }, id);
  });
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(owner.get(id).pending).toBe(true);
    expect(responseAge(owner.get(id).snapshot!, performance.now())).toBe(60_000);
    expect(boardStatus(owner.get(id), performance.now(), true).tone).toBe('success');
    await vi.advanceTimersByTimeAsync(1);
    expect(boardStatus(owner.get(id), performance.now(), true).tone).toBe('warning');
    await vi.advanceTimersByTimeAsync(8_999);
    expect(owner.get(id)).toMatchObject({ pending: false, error: null });
    expect(responseAge(owner.get(id).snapshot!, performance.now())).toBe(34_000);
    expect(boardStatus(owner.get(id), performance.now(), true).tone).toBe('success');
  } finally { owner.dispose(); }
});

it.each([0, 60_001])('preserves partial-feed, failure and offline precedence for data aged %s ms', age => {
  const feeds = [
    { lineId: 'northern', stopAreaId: id, liveState: 'available' },
    { lineId: 'district', stopAreaId: id, liveState: 'unavailable' },
  ];
  const snapshot = decodeSnapshot({ ...camden, generatedAt: camden.observedAt,
    catalogue: { stationId: id, liveState: 'partial', platforms: [], feeds },
  }, id);
  const state = { snapshot, pending: true, error: null };
  expect(boardStatus(state, server + age, true, feeds)).toEqual({ tone: 'warning', label: 'Some live departures temporarily unavailable' });
  expect(boardStatus(state, server + age, false, feeds)).toEqual({ tone: 'danger', label: 'Offline. Predictions may be outdated' });
  for (const error of ['timeout', 'unavailable', 'limited'] as const) {
    expect(boardStatus({ ...state, error }, server + age, true, feeds)).toEqual({ tone: 'danger', label: 'Departures request failed. Predictions may be outdated' });
  }
});
