/** Server-relative snapshot timing regressions for NB-44. */
import { afterEach, expect, it, vi } from 'vitest';
import camden from '../assets/camden-mixed.json';
import { decodeSnapshot, httpTransport } from '../src/api';
import { createStationOwner, isStale } from '../src/station-owner';
import { boardRows, boardStatus, unassignedCount } from '../src/board-model';

const id = camden.station.id;
const server = Date.parse(camden.observedAt);
const selection = { stationId: id, platform: 'A', direction: 'Southbound' } as const;
const input = () => decodeSnapshot({ ...camden, generatedAt: camden.observedAt }, id);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each([-600_000, 600_000])('ignores wall-clock skew %s and later adjustments throughout countdown and freshness', async skew => {
  vi.useFakeTimers({ now: server + skew });
  let elapsed = 100;
  const owner = createStationOwner(async () => input(), () => elapsed);
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(0);
    const initial = boardRows(owner.get(id).snapshot, selection, elapsed, 3);
    expect(initial.map(row => row.countdown)).toEqual(boardRows(input(), selection, server, 3).map(row => row.countdown));
    expect(isStale(owner.get(id), elapsed, true)).toBe(false);
    vi.setSystemTime(server - skew * 3);
    elapsed += 60_001;
    expect(isStale(owner.get(id), elapsed, true)).toBe(true);
    expect(boardStatus(owner.get(id), elapsed, true).tone).toBe('warning');
    expect(boardRows(owner.get(id).snapshot, selection, elapsed, 3).map(row => row.countdown))
      .toEqual(boardRows(input(), selection, server + 60_001, 3).map(row => row.countdown));
  } finally { owner.dispose(); }
});

it('includes response body parsing in conservative request uncertainty and retains mixed cached feed ages', async () => {
  vi.useFakeTimers();
  let elapsed = 0;
  const old = { lineId: 'northern', stopAreaId: id, liveState: 'available', fetchedAt: new Date(server - 55_000).toISOString() };
  const fresh = { lineId: 'district', stopAreaId: 'other', liveState: 'available', fetchedAt: camden.observedAt };
  const payload = { ...camden, generatedAt: camden.observedAt, observedAt: old.fetchedAt,
    catalogue: { stationId: id, liveState: 'available', platforms: [], feeds: [old, fresh] } };
  const transport = httpTransport('https://example.test', false, vi.fn<typeof fetch>().mockResolvedValue({
    status: 200, ok: true, json: async () => { elapsed = 8_000; return payload; },
  } as Response));
  const owner = createStationOwner(transport, () => elapsed);
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(0);
    expect(isStale(owner.get(id), elapsed, true)).toBe(true);
    expect(boardStatus(owner.get(id), elapsed, true, [old]).tone).toBe('warning');
    expect(boardStatus(owner.get(id), elapsed, true, [fresh]).tone).toBe('success');
    expect(boardRows(owner.get(id).snapshot, selection, elapsed, 3).map(row => row.countdown))
      .toEqual(boardRows(input(), selection, server + 8_000, 3).map(row => row.countdown));
  } finally { owner.dispose(); }
});

it('expires assigned and unassigned rows on one reference and invalidates suspended-clock snapshots until recovery', async () => {
  vi.useFakeTimers();
  let elapsed = 0;
  let fail = false;
  const owner = createStationOwner(async () => { if (fail) throw new Error('offline'); return input(); }, () => elapsed);
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(0);
    elapsed = 3_600_000;
    expect(boardRows(owner.get(id).snapshot, selection, elapsed, 3)).toEqual([]);
    expect(unassignedCount(owner.get(id).snapshot, elapsed)).toBe(0);
    elapsed = 0; // Model a platform clock which stopped while the app was suspended.
    owner.setActive(false);
    fail = true;
    owner.setActive(true);
    expect(isStale(owner.get(id), elapsed, true)).toBe(true);
    expect(boardStatus(owner.get(id), elapsed, true)).toEqual({ tone: 'warning', label: 'Refreshing departures after app resume' });
    expect(boardRows(owner.get(id).snapshot, selection, elapsed, 3)).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(isStale(owner.get(id), elapsed, true)).toBe(true);
    expect(boardStatus(owner.get(id), elapsed, true)).toEqual({ tone: 'danger', label: 'Departures request failed. Predictions may be outdated' });
    fail = false;
    expect(await owner.refresh([id])).toBe('success');
    expect(isStale(owner.get(id), elapsed, true)).toBe(false);
    expect(boardStatus(owner.get(id), elapsed, true).tone).toBe('success');
    expect(boardRows(owner.get(id).snapshot, selection, elapsed, 3).length).toBeGreaterThan(0);
  } finally { owner.dispose(); }
});

it('accepts legacy payloads using an observedAt approximation and rejects malformed new timing', () => {
  expect(decodeSnapshot(camden, id).generatedAt).toBeUndefined();
  expect(input().generatedAt).toBe(camden.observedAt);
  expect(() => decodeSnapshot({ ...camden, generatedAt: 'bad' }, id)).toThrow();
});

it('keeps polling, manual cooldown and rate limiting on the injected elapsed clock after wall adjustments', async () => {
  vi.useFakeTimers({ now: server });
  let elapsed = 0;
  let limited = false;
  const request = vi.fn(async () => {
    if (limited) throw { kind: 'limited', retryAfterSeconds: 45 };
    return input();
  });
  const owner = createStationOwner(request, () => elapsed);
  try {
    owner.own([id]);
    await vi.advanceTimersByTimeAsync(0);
    await owner.refresh([id]);
    expect(request).toHaveBeenCalledTimes(2);
    vi.setSystemTime(server + 3_600_000);
    expect(await owner.refresh([id])).toBeNull();
    elapsed = 10_000;
    limited = true;
    expect(await owner.refresh([id])).toBe('failure');
    vi.setSystemTime(server - 3_600_000);
    expect(owner.isRateLimited()).toBe(true);
    elapsed = 54_999;
    expect(await owner.refresh([id])).toBeNull();
    elapsed = 55_000;
    limited = false;
    expect(owner.isRateLimited()).toBe(false);
    expect(await owner.refresh([id])).toBe('success');
    elapsed = 84_999;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(request).toHaveBeenCalledTimes(4);
    elapsed = 85_000;
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(5);
  } finally { owner.dispose(); }
});

it('anchors old-server payloads explicitly and keeps the injected synthetic clock frozen', async () => {
  vi.useFakeTimers();
  const { fixtureRuntime } = await import('../src/fixture');
  const fixture = fixtureRuntime('status-age', true);
  const owner = createStationOwner(fixture.transport, fixture.now, fixture.now);
  const legacy = createStationOwner(async () => decodeSnapshot(camden, id), () => 50);
  try {
    owner.own([id]); legacy.own([id]);
    await vi.advanceTimersByTimeAsync(0);
    expect(legacy.get(id).snapshot?.timing?.approximate).toBe(true);
    expect(boardRows(legacy.get(id).snapshot, selection, 50, 3).map(row => row.countdown))
      .toEqual(boardRows(decodeSnapshot(camden, id), selection, server, 3).map(row => row.countdown));
    expect(owner.get(id).snapshot?.timing?.uncertaintyMs).toBe(0);
    expect(isStale(owner.get(id), fixture.now(), true)).toBe(true);
    expect(boardStatus(owner.get(id), fixture.now(), true).tone).toBe('warning');
  } finally { owner.dispose(); legacy.dispose(); }
});

it.each([[29_999, 'Due'], [30_000, '1 min'], [149_999, '2 min'], [150_000, '3 min'], [-30_000, 'Due'], [-30_001, null]])(
  'preserves NB-40 nearest-minute and Due formatting at %s with an accepted elapsed-clock snapshot', async (offset, text) => {
    vi.useFakeTimers();
    const value = input();
    value.platforms = [{ ...value.platforms[0], departures: [{ ...value.platforms[0].departures[0],
      expectedArrival: new Date(server + offset).toISOString() }] }];
    const owner = createStationOwner(async () => value, () => 20);
    try {
      owner.own([id]);
      await vi.advanceTimersByTimeAsync(0);
      const rows = boardRows(owner.get(id).snapshot, selection, 20, 3);
      expect(rows[0]?.countdown ?? null).toBe(text);
    } finally { owner.dispose(); }
  });
