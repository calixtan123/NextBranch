/** Runtime clock wiring regressions for deterministic native fixture replays. */
import Module from 'node:module';
import * as fixtureModule from '../src/fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/runtime';
import { boardRows, boardStatus } from '../src/board-model';
import { isStale } from '../src/station-owner';
import { responseAge } from '../../src/lib/northern/response-time';
import camden from '../assets/camden-mixed.json';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}),
} }));

const id = camden.station.id;
let runtime: ReturnType<typeof createRuntime> | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('__DEV__', true);
  // Metro resolves this development-only require. Bridge it to the real fixture
  // module under Vitest, whose module loader handles TypeScript imports.
  const loader = Module as unknown as { _load: (request: string, ...args: unknown[]) => unknown };
  const load = loader._load;
  vi.spyOn(loader, '_load').mockImplementation((request, ...args) =>
    request === './fixture' ? fixtureModule : load(request, ...args));
});

afterEach(() => {
  runtime?.stations.dispose();
  runtime = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('recovers status-recovery after the manual cooldown while display and observation time stay frozen', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'status-recovery');
  runtime = createRuntime();
  const frozen = runtime.now();
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(0);
  const selection = runtime.catalogue.at(id)[0];
  const initialRows = boardRows(runtime.stations.get(id).snapshot, selection, runtime.now(), 3);
  expect(initialRows.length).toBeGreaterThan(0);
  expect(await runtime.stations.refresh([id])).toBe('failure');
  expect(runtime.stations.get(id).error).toBe('unavailable');
  await vi.advanceTimersByTimeAsync(9_999);
  expect(await runtime.stations.refresh([id])).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(await runtime.stations.refresh([id])).toBe('success');
  expect(runtime.stations.get(id).error).toBeNull();
  expect(runtime.now()).toBe(frozen);
  expect(runtime.stations.get(id).snapshot?.timing?.receivedAt).toBe(frozen);
  expect(boardRows(runtime.stations.get(id).snapshot, selection, runtime.now(), 3)).toEqual(initialRows);
});

it('automatically recovers camden-rate-limited at the advancing retry deadline', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'camden-rate-limited');
  runtime = createRuntime();
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(0);
  expect(await runtime.stations.refresh([id])).toBe('failure');
  expect(runtime.stations.isRateLimited()).toBe(true);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(runtime.stations.get(id).error).toBe('limited');
  expect(await runtime.stations.refresh([id])).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.stations.isRateLimited()).toBe(false);
  expect(runtime.stations.get(id).error).toBeNull();
});

it('automatically polls an ordinary fixture without advancing its display clock', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'board-growth');
  runtime = createRuntime();
  const frozen = runtime.now();
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(0);
  const initial = runtime.stations.get(id).snapshot;
  await vi.advanceTimersByTimeAsync(29_999);
  expect(runtime.stations.get(id).snapshot).toBe(initial);
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.stations.get(id).snapshot).not.toBe(initial);
  expect(runtime.stations.get(id).snapshot?.platforms[0].departures.length)
    .toBeGreaterThan(initial!.platforms[0].departures.length);
  expect(runtime.now()).toBe(frozen);
});

it('keeps live display and scheduling on performance.now through wall-clock changes', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', '');
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_API_URL', 'https://example.test');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ...camden, generatedAt: camden.observedAt })));
  vi.stubGlobal('fetch', fetch);
  runtime = createRuntime();
  expect(runtime.synthetic).toBe(false);
  expect(runtime.now()).toBe(performance.now());
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(0);
  expect(await runtime.stations.refresh([id])).toBe('success');
  vi.setSystemTime(Date.now() + 3_600_000);
  expect(await runtime.stations.refresh([id])).toBeNull();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(runtime.now()).toBe(10_000);
  expect(await runtime.stations.refresh([id])).toBe('success');
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('preserves exact fixture freshness boundaries despite advancing request scheduling samples', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'status-age');
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => ++elapsed);
  runtime = createRuntime();
  const colindale = '940GZZLUCND';
  runtime.stations.own([colindale, id]);
  await vi.advanceTimersByTimeAsync(0);
  const fresh = runtime.stations.get(colindale);
  const stale = runtime.stations.get(id);
  expect(responseAge(fresh.snapshot!, runtime.now())).toBe(60_000);
  expect(responseAge(stale.snapshot!, runtime.now())).toBe(60_001);
  expect(isStale(fresh, runtime.now(), true)).toBe(false);
  expect(isStale(stale, runtime.now(), true)).toBe(true);
  expect(boardStatus(fresh, runtime.now(), true).tone).toBe('success');
  expect(boardStatus(stale, runtime.now(), true).tone).toBe('warning');
  expect(fresh.snapshot?.timing?.uncertaintyMs).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(responseAge(fresh.snapshot!, runtime.now())).toBe(60_000);
});

it('keeps delayed synthetic loading deterministic while its request deadline advances', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'status-loading');
  runtime = createRuntime();
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(14_999);
  expect(runtime.stations.get(id).pending).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  const state = runtime.stations.get(id);
  expect(state.pending).toBe(false);
  expect(state.error).toBeNull();
  expect(state.snapshot?.timing?.uncertaintyMs).toBe(0);
  expect(responseAge(state.snapshot!, runtime.now())).toBe(0);
});


it('retains conservative live body parsing duration on the monotonic clock through wall adjustments', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_FIXTURE', '');
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_API_URL', 'https://example.test');
  const payload = { ...camden, generatedAt: camden.observedAt };
  const response = new Response(JSON.stringify(payload));
  vi.spyOn(response, 'json').mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 8_000));
    return payload;
  });
  vi.stubGlobal('fetch', vi.fn(async () => response));
  runtime = createRuntime();
  runtime.stations.own([id]);
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.stations.get(id).pending).toBe(true);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(camden.observedAt) - 3_600_000);
  await vi.advanceTimersByTimeAsync(8_000);
  const state = runtime.stations.get(id);
  expect(state.error).toBeNull();
  expect(state.snapshot?.timing?.uncertaintyMs).toBe(8_000);
  expect(state.snapshot?.timing?.receivedAt).toBe(8_000);
  expect(responseAge(state.snapshot!, runtime.now())).toBe(8_000);
});

it.each([
  { dev: false, widget: '', mock: '', enabled: false },
  { dev: false, widget: '', mock: '1', enabled: false },
  { dev: false, widget: '1', mock: '', enabled: false },
  { dev: true, widget: '1', mock: '1', enabled: false },
  { dev: false, widget: '1', mock: '1', enabled: true },
])('enables mock plans only in the TestFlight release bundle ($dev, $widget, $mock)', async ({ dev, widget, mock, enabled }) => {
  vi.stubGlobal('__DEV__', dev);
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_TESTFLIGHT_WIDGET', widget);
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_MOCK_PLANS', mock);
  runtime = createRuntime();
  await runtime.preferences.load();
  expect(runtime.preferences.get().mockPlan).toBe(enabled ? 'free' : undefined);
});
