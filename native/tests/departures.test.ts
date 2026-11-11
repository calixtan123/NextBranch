import { afterEach, expect, it, vi } from 'vitest';
import camden from '../assets/camden-mixed.json';
import colindale from '../assets/colindale-mixed.json';
import { createStationOwner, isStale } from '../src/station-owner';
import { decodeSnapshot, httpTransport, type StationTransport } from '../src/api';
import { boardRows, departureIdentity, layoutFor, matrixWidth, unassignedCount, wrapMatrix } from '../src/board-model';

const C = camden.station.id;
const L = colindale.station.id;
const now = Date.parse(camden.observedAt);
const snapshot = decodeSnapshot(camden, C);
const a = { stationId: C, platform: 'A', direction: 'Southbound' } as const;
const body = (id: string) => decodeSnapshot(id === C ? camden : colindale, id);
const settle = () => vi.advanceTimersByTimeAsync(0);
afterEach(() => vi.useRealTimers());

it('matches only the physical tuple, keeps every branch, expires before limiting, and preserves fallback text', () => {
  expect(boardRows(snapshot, a, now, 3).map(row => row.id)).toEqual([1, 2, 3].map(i => 'sample-camden-a-' + i));
  const detail = boardRows(snapshot, a, now, 5);
  expect(detail.map(row => row.id)).toEqual([1, 2, 3, 4, 5].map(i => 'sample-camden-a-' + i));
  expect(detail.map(row => row.branch)).toEqual(['via Bank', 'via Charing Cross', 'via Bank', 'via Charing Cross', '']);
  expect(boardRows(snapshot, { ...a, direction: 'Northbound' }, now, 5)).toEqual([]);
  expect(boardRows(snapshot, { ...a, stationId: L }, now, 5)).toEqual([]);
  const first = Date.parse(detail[0].expectedArrival);
  expect(boardRows(snapshot, a, first + 30_000, 3)[0].countdown).toBe('Due');
  expect(boardRows(snapshot, a, first + 30_001, 3).map(row => row.id)).toEqual([
    'sample-camden-a-2', 'sample-camden-a-3', 'sample-camden-a-4',
  ]);
  expect(boardRows(snapshot, a, first + 30_001, 5).at(-1)?.destination).toBe('Unknown destination');
  expect(unassignedCount(snapshot, now)).toBe(1);
  expect(boardRows(snapshot, a, now + 3_600_000, 5)).toEqual([]);
});

it.each([
  ['Epping Underground Station', null, 'Epping', ''],
  ['Hainault Underground Station', 'Hainault via Newbury Park', 'Hainault', 'via Newbury Park'],
  ['Hainault Underground Station via Newbury Park', 'Hainault via Newbury Park', 'Hainault via Newbury Park', ''],
  ['  Hainault  uNdErGrOuNd   StAtIoN  VIA  Newbury Park  ', 'Hainault via newbury park', 'Hainault VIA Newbury Park', ''],
  ['Morden Underground Station', 'Morden via bank', 'Morden', 'via Bank'],
  ['Morden Underground Station', 'Morden via cx', 'Morden', 'via Charing Cross'],
  ['Morden via Charing Cross', 'Morden via CX', 'Morden via Charing Cross', ''],
  ['Hainault via Newbury Park', 'Hainault via Stratford', 'Hainault via Newbury Park', 'via Stratford'],
  ['Underground Station Road', null, 'Underground Station Road', ''],
  ['Station Approach Underground', null, 'Station Approach Underground', ''],
  ['  ', null, 'Unknown destination', ''],
  ['Underground Station', null, 'Unknown destination', ''],
  [null, null, 'Unknown destination', ''],
])('shortens display destination %s and preserves advertised route %s without changing the source', (destinationName, towards, destination, branch) => {
  const input: typeof snapshot = { ...snapshot, platforms: [{ platform: 'A', direction: 'Southbound', departures: [{
    ...snapshot.platforms[0].departures[0], destinationName, towards,
  }] }] };
  const before = JSON.stringify(input);

  const rows = boardRows(input, a, now, 3);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ destination, branch });
  expect(JSON.stringify(input)).toBe(before);
});

it('counts unassigned predictions through the exact 30-second grace boundary', () => {
  const unassigned = snapshot.platforms.find(group => group.platform === null)!.departures[0];
  const arrival = Date.parse(unassigned.expectedArrival);
  expect(unassignedCount(snapshot, arrival + 30_000)).toBe(1);
  expect(unassignedCount(snapshot, arrival + 30_001)).toBe(0);
});

it('switches Amber to readable native text at accessibility sizes and preserves unsupported characters', () => {
  expect(layoutFor('amber', 1, 'Morden via Bank')).toBe('matrix');
  expect(layoutFor('amber', 2, 'Morden via Charing Cross')).toBe('text');
  expect(layoutFor('amber', 1, 'Elephant & Castle')).toBe('matrix');
  expect(layoutFor('amber', 1, 'München 🚆')).toBe('text');
  expect(layoutFor('amber', 1, 'ß')).toBe('text');
  expect(layoutFor('amber', 1, '')).toBe('text');
});

it('sizes Morden via Bank at the pinned Amber scale', () => {
  expect(matrixWidth('Morden via Bank', .78)).toBeCloseTo(146.718, 6);
});

it('keeps Morden via Bank together at its pinned width and wraps just below it', () => {
  expect(wrapMatrix('Morden via Bank', 146.718, .78)).toEqual(['Morden via Bank']);
  expect(wrapMatrix('Morden via Bank', 146.717, .78)).toEqual(['Morden via', 'Bank']);
});

it('accepts offset timestamps, rejects malformed and wrong-station responses and enforces release HTTPS', () => {
  expect(decodeSnapshot({ ...camden, observedAt: '2026-09-16T13:00:00+01:00' }, C).station.id).toBe(C);
  expect(() => decodeSnapshot(camden, L)).toThrow();
  expect(() => decodeSnapshot({ ...camden, platforms: [{}] }, C)).toThrow();
  expect(() => httpTransport('http://localhost:3000', false)).toThrow();
  expect(() => httpTransport('/api', false)).toThrow();
});

it('coalesces station owners, reuses fresh detail, isolates errors and retains stale status while retrying', async () => {
  vi.useFakeTimers({ now });
  let failCamden = false;
  const request = vi.fn<StationTransport>(async id => {
    if (id === C && failCamden) throw Error('down');
    return body(id);
  });
  const owner = createStationOwner(request, Date.now);
  owner.own([L, C, C]);
  await settle();
  expect(request.mock.calls.map(([id]) => id)).toEqual([L, C]);
  owner.own([C]);
  await settle();
  expect(request).toHaveBeenCalledTimes(2);
  expect(isStale(owner.get(C), now + 30_000, true)).toBe(false);
  expect(isStale(owner.get(C), now + 30_001, true)).toBe(true);
  failCamden = true;
  await owner.refresh([C]);
  expect(owner.get(C).snapshot).toEqual(snapshot);
  expect(isStale(owner.get(C), now, true)).toBe(true);
  expect(owner.get(L).error).toBeNull();
  expect(await owner.refresh([C])).toBeNull();
  failCamden = false;
  vi.setSystemTime(now + 10_000);
  const retry = owner.refresh([C]);
  expect(isStale(owner.get(C), Date.now(), true)).toBe(true);
  await retry;
  expect(isStale(owner.get(C), Date.now(), true)).toBe(false);
  owner.dispose();
});

it('keeps the shared 429 deadline despite an unrelated in-flight success and applies it on resume', async () => {
  vi.useFakeTimers({ now });
  let resolveColindale!: (data: ReturnType<typeof body>) => void;
  const request = vi.fn<StationTransport>()
    .mockRejectedValueOnce({ kind: 'limited', retryAfterSeconds: 45 })
    .mockImplementationOnce(() => new Promise(resolve => { resolveColindale = resolve; }))
    .mockImplementation(async id => body(id));
  const owner = createStationOwner(request, Date.now);
  owner.own([C, L]);
  await settle();
  resolveColindale(body(L));
  await settle();
  expect(await owner.refresh([L])).toBeNull();
  owner.setActive(false);
  await vi.advanceTimersByTimeAsync(40_000);
  owner.setActive(true);
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(request.mock.calls.slice(2).map(([id]) => id).sort()).toEqual([C, L].sort());
  owner.dispose();
});

it('times out while reading a response body, ignores late superseded results and pauses while inactive', async () => {
  vi.useFakeTimers({ now });
  let complete!: (data: unknown) => void;
  const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => new Promise(resolve => { complete = resolve; }),
  } as Response);
  const request = httpTransport('https://example.test', false, fakeFetch);
  const owner = createStationOwner(request, Date.now);
  owner.own([C]);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(owner.get(C).error).toBe('timeout');
  expect(owner.get(C).pending).toBe(false);
  expect(fakeFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  owner.own([]);
  complete(camden);
  await settle();
  expect(owner.get(C).snapshot).toBeUndefined();
  owner.setActive(false);
  owner.own([L]);
  await vi.advanceTimersByTimeAsync(100_000);
  expect(fakeFetch).toHaveBeenCalledTimes(1);
  owner.setActive(true);
  await settle();
  expect(fakeFetch).toHaveBeenCalledTimes(2);
  owner.own([C]);
  complete(colindale);
  await settle();
  expect(owner.get(L).snapshot).toBeUndefined();
  owner.dispose();
});

it('defers newly owned stations after 429 and exposes the reason until the shared deadline', async () => {
  vi.useFakeTimers({ now });
  const request = vi.fn<StationTransport>()
    .mockRejectedValueOnce({ kind: 'limited', retryAfterSeconds: 15 })
    .mockImplementation(async id => body(id));
  const owner = createStationOwner(request, Date.now);
  owner.own([C]);
  await settle();
  owner.own([L]);
  expect(owner.get(L).error).toBeNull();
  expect(owner.isRateLimited()).toBe(true);
  expect(await owner.refresh([L])).toBeNull();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(request.mock.calls.map(([id]) => id)).toEqual([C, L]);
  expect(owner.isRateLimited()).toBe(false);
  owner.dispose();
});

it('uses the server interval, pauses offline, and retains matching data until reconnect succeeds', async () => {
  vi.useFakeTimers({ now });
  const request = vi.fn<StationTransport>(async id => ({ ...body(id), refreshAfterSeconds: 12 }));
  const owner = createStationOwner(request, Date.now);
  owner.own([C]);
  await vi.advanceTimersByTimeAsync(11_999);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(request).toHaveBeenCalledTimes(2);
  owner.setOnline(false);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(request).toHaveBeenCalledTimes(2);
  expect(isStale(owner.get(C), Date.now(), owner.isOnline())).toBe(true);
  expect(await owner.refresh([C])).toBeNull();
  owner.setOnline(true);
  await settle();
  expect(request).toHaveBeenCalledTimes(3);
  owner.dispose();
});

it('uses exactly the documented GET URL and stops retrying an invalid station', async () => {
  vi.useFakeTimers({ now });
  const request = vi.fn<typeof fetch>().mockResolvedValue({ status: 400, ok: false } as Response);
  const owner = createStationOwner(httpTransport('https://example.test/', false, request), Date.now);
  owner.own([C]);
  await settle();
  expect(request.mock.calls[0][0]).toBe('https://example.test/api/departures?station=' + C);
  expect(request.mock.calls[0][1]?.cache).toBe('no-store');
  expect(owner.get(C).error).toBe('invalid');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await owner.refresh([C])).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  owner.dispose();
});

it('preserves a published blank platform number while keeping whitespace and empty physical identities invalid', () => {
  const group = { platform: '', direction: 'Eastbound', physicalPlatformId: '940GZZCRADD-EB-tram', departures: [] };
  const value = { ...camden, platforms: [group] };
  expect(decodeSnapshot(value, C).platforms[0].platform).toBe('');
  for (const invalid of [{ platform: ' ' }, { platform: ' 1' }, { physicalPlatformId: '' }]) {
    expect(() => decodeSnapshot({ ...value, platforms: [{ ...group, ...invalid }] }, C)).toThrow();
  }
});

it('shares canonical station work across service aliases and keeps a remaining consumer alive', async () => {
  vi.useFakeTimers({ now });
  let complete!: (value: typeof snapshot) => void;
  const request = vi.fn<StationTransport>(() => new Promise(resolve => { complete = resolve; }));
  const resolveStation = (id: string) => id === 'camden-alias' ? C : id;
  const owner = createStationOwner(request, Date.now, Date.now, resolveStation);
  owner.own([C, 'camden-alias']);
  await settle();
  expect(request.mock.calls.map(([id]) => id)).toEqual([C]);
  owner.own(['camden-alias']);
  expect(request.mock.calls[0][1].aborted).toBe(false);
  complete(snapshot);
  await settle();
  expect(owner.get(C).snapshot?.station.id).toBe(C);
  expect(owner.get('camden-alias').snapshot?.station.id).toBe('camden-alias');
  expect(owner.get('camden-alias').snapshot?.platforms).toEqual(snapshot.platforms);
  owner.own([]);
  owner.own([C]);
  await settle();
  expect(request).toHaveBeenCalledTimes(1);
  owner.dispose();
});

it('cancels alias-shared work only after its last consumer leaves and rejects a wrong canonical response', async () => {
  vi.useFakeTimers({ now });
  const request = vi.fn<StationTransport>(async () => body(L));
  const owner = createStationOwner(request, Date.now, Date.now, id => id === 'alias' ? C : id);
  owner.own(['alias']);
  await settle();
  expect(owner.get(C).error).toBe('unavailable');
  expect(owner.get('alias').snapshot).toBeUndefined();
  owner.dispose();
  const pending = vi.fn<StationTransport>(() => new Promise(() => {}));
  const second = createStationOwner(pending, Date.now, Date.now, id => id === 'alias' ? C : id);
  second.own([C, 'alias']);
  await settle();
  second.own([]);
  expect(pending.mock.calls[0][1].aborted).toBe(true);
  second.dispose();
});

it('shares alias refresh cooldown, offline snapshots and app-wide rate limiting', async () => {
  vi.useFakeTimers({ now });
  let limited = false;
  const request = vi.fn<StationTransport>(async id => {
    if (limited) throw { kind: 'limited', retryAfterSeconds: 45 };
    return body(id);
  });
  const owner = createStationOwner(request, Date.now, Date.now, id => id === 'alias' ? C : id);
  owner.own([C, 'alias']);
  await settle();
  expect(await owner.refresh([C, 'alias'])).toBe('success');
  expect(request).toHaveBeenCalledTimes(2);
  expect(await owner.refresh(['alias'])).toBeNull();
  owner.setOnline(false);
  expect(isStale(owner.get('alias'), now, owner.isOnline())).toBe(true);
  expect(owner.get('alias').snapshot?.station.id).toBe('alias');
  limited = true;
  owner.setOnline(true);
  await settle();
  expect(owner.get('alias').error).toBe('limited');
  owner.own(['alias', L]);
  expect(await owner.refresh([C, 'alias', L])).toBeNull();
  await vi.advanceTimersByTimeAsync(44_999);
  expect(request).toHaveBeenCalledTimes(3);
  limited = false;
  await vi.advanceTimersByTimeAsync(1);
  expect(request.mock.calls.slice(3).map(([id]) => id).sort()).toEqual([C, L].sort());
  expect(isStale(owner.get('alias'), Date.now(), true)).toBe(true);
  owner.dispose();
});


it('renders each supported punctuation glyph with seven binary rows of five columns', async () => {
  const { glyphs } = await import('../src/glyphs');
  for (const character of "()&'‘’/, +?![]–—") {
    expect(layoutFor('amber', 1, character)).toBe('matrix');
    expect(glyphs[character]).toHaveLength(7);
  }
  for (const glyph of Object.values(glyphs)) {
    expect(glyph).toHaveLength(7);
    expect(glyph.every(row => /^[01]{5}$/.test(row))).toBe(true);
  }
  expect(layoutFor('modern', 1, 'Barking (Hammersmith & City)')).toBe('text');
  expect(layoutFor('amber', 1.16, 'Barking (Hammersmith & City)')).toBe('text');
});

it.each([
  ['hammersmith-city', ['hammersmith-city'], 'Barking', '', 'Barking (Hammersmith & City)'],
  ['circle', ['circle'], 'Hammersmith', '', 'Hammersmith (Circle)'],
  ['district', ['district', 'circle'], 'Ealing Broadway', '', 'Ealing Broadway (District)'],
  ['northern', ['northern'], 'Morden', '', 'Morden'],
  ['district', ['district', 'district'], 'Ealing Broadway', '', 'Ealing Broadway'],
  ['district', ['district', 'national-rail'], 'Ealing Broadway', '', 'Ealing Broadway'],
  [undefined, ['district', 'circle'], 'Barking', '', 'Barking'],
  ['unknown', ['district', 'circle'], 'Barking', '', 'Barking'],
  ['toString', ['district', 'circle'], 'Barking', '', 'Barking'],
  ['circle', [], 'Hammersmith', '', 'Hammersmith (Circle)'],
  ['circle', ['circle'], 'Hammersmith', 'via Paddington', 'Hammersmith (Circle) via Paddington'],
  ['circle', ['circle'], 'Hammersmith via Paddington', '', 'Hammersmith (Circle) via Paddington'],
  ['circle', ['circle'], 'Hammersmith (Circle) via Paddington', 'via Paddington', 'Hammersmith (Circle) via Paddington'],
  ['circle', ['circle'], 'Edgware Road (Circle Line)', '', 'Edgware Road (Circle)'],
  ['circle', ['circle'], 'Edgware Road (cIrClE lInE) via Paddington', '', 'Edgware Road (Circle) via Paddington'],
  ['hammersmith-city', ['hammersmith-city'], 'Barking (Hammersmith & City Line)', '', 'Barking (Hammersmith & City)'],
  ['hammersmith-city', ['hammersmith-city'], 'Barking (Hammersmith & City)', '', 'Barking (Hammersmith & City)'],
  ['circle', ['circle'], 'Paddington (H&C)', '', 'Paddington (H&C) (Circle)'],
  ['circle', ['circle'], 'Kensington (Olympia)', '', 'Kensington (Olympia) (Circle)'],
])('formats actual %s identity using distinct memberships %j', (lineId, ids, destination, branch, expected) => {
  const row = { ...boardRows(snapshot, a, now, 3)[0], lineId, destination, branch };
  const services = ids.map(id => ({ line_id: id, line_name: id === 'circle' ? 'Circle' : id === 'district' ? 'District' : id === 'hammersmith-city' ? 'Hammersmith & City' : id }));
  const before = JSON.stringify({ row, services });
  expect(departureIdentity(row, services)).toBe(expected);
  expect(JSON.stringify({ row, services })).toBe(before);
});
