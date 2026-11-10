import { REFRESH_SECONDS } from '../../src/lib/northern/time';
import type { FailureKind, Snapshot, StationTransport } from './api';

const DEADLINE = 20_000;
const MANUAL_COOLDOWN = 10_000;
const FRESH_FOR = 30_000;
const MAX_TIMER = 2_147_483_647;
type Outcome = 'success' | 'failure' | 'cancelled';
type Flight = { controller: AbortController; result: Promise<Outcome> };
type Entry = {
  snapshot?: Snapshot;
  error: FailureKind | null;
  flight?: Flight;
  timer?: ReturnType<typeof setTimeout>;
  nextAt: number;
  manualAt: number;
};
type StationState = { snapshot?: Snapshot; error: FailureKind | null; pending: boolean };
const idle = { error: null, pending: false } as const;

/** Marks matching memory stale by observed age, failure or connectivity. */
export function isStale(state: StationState, now: number, online: boolean): boolean {
  return Boolean(state.snapshot && (!online || state.error || now - Date.parse(state.snapshot.observedAt) > FRESH_FOR));
}

/** Coordinates one request, snapshot and polling timer for each visible station. */
export function createStationOwner(transport: StationTransport, now = Date.now, observationNow = now) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let owned = new Set<string>();
  let active = true;
  let online = true;
  let retryAt = 0;
  let version = 0;
  const publish = () => {
    version += 1;
    listeners.forEach(listener => listener());
  };
  function entryFor(id: string): Entry {
    const existing = entries.get(id);
    if (existing) return existing;
    const entry = { error: null, nextAt: 0, manualAt: 0 };
    entries.set(id, entry);
    return entry;
  }
  function cancel(entry: Entry) {
    clearTimeout(entry.timer);
    entry.timer = undefined;
    const previous = entry.flight;
    entry.flight = undefined;
    previous?.controller.abort();
  }
  function canRun(id: string) {
    return active && online && owned.has(id);
  }
  function schedule(id: string) {
    const entry = entryFor(id);
    clearTimeout(entry.timer);
    entry.timer = undefined;
    if (!canRun(id) || entry.flight || entry.error === 'invalid' || entry.error === 'configuration') return;
    const wait = Math.max(entry.nextAt, retryAt) - now();
    if (wait <= 0) {
      start(id);
    } else {
      entry.timer = setTimeout(() => schedule(id), Math.min(wait, MAX_TIMER));
    }
  }
  function start(id: string): Flight {
    const entry = entryFor(id);
    const controller = new AbortController();
    const deadline = Symbol('deadline');
    const cancellation = Symbol('cancelled');
    let timer: ReturnType<typeof setTimeout>;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(deadline);
        controller.abort();
      }, DEADLINE);
      controller.signal.addEventListener('abort', () => reject(cancellation), { once: true });
    });
    const result: Promise<Outcome> = Promise.race([
      limit,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw cancellation;
        return transport(id, controller.signal);
      }),
    ]).then(data => {
      if (entry.flight !== flight) return 'cancelled';
      if (data.station.id !== id) {
        entry.error = 'unavailable';
        return 'failure';
      }
      entry.snapshot = data;
      entry.error = null;
      return 'success';
    }, (error: unknown) => {
      if (entry.flight !== flight || error === cancellation) return 'cancelled';
      const failure = error as { kind?: FailureKind; retryAfterSeconds?: number } | null;
      const kind = error === deadline ? 'timeout' : failure?.kind ?? 'unavailable';
      entry.error = kind;
      if (kind === 'limited') {
        const seconds = failure?.retryAfterSeconds ?? REFRESH_SECONDS;
        retryAt = Math.max(retryAt, now() + seconds * 1_000);
        owned.forEach(station => {
          if (station !== id) schedule(station);
        });
      }
      return 'failure';
    }).finally(() => {
      clearTimeout(timer);
      if (entry.flight !== flight) return;
      entry.flight = undefined;
      const interval = (entry.snapshot?.refreshAfterSeconds ?? REFRESH_SECONDS) * 1_000;
      entry.nextAt = entry.error === 'limited' ? retryAt : now() + interval;
      schedule(id);
      publish();
    });
    const flight = { controller, result };
    entry.flight = flight;
    publish();
    return flight;
  }
  function restartOwned() {
    owned.forEach(id => {
      entryFor(id).nextAt = 0;
      schedule(id);
    });
  }
  return {
    version: () => version,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get(id: string): StationState {
      const entry = entries.get(id);
      return entry ? { snapshot: entry.snapshot, error: entry.error, pending: Boolean(entry.flight) } : idle;
    },
    isOnline: () => online,
    isActive: () => active,
    isRateLimited: () => now() < retryAt,
    own(ids: readonly string[]) {
      const next = new Set(ids);
      const previous = owned;
      if (next.size === previous.size && [...next].every(id => previous.has(id))) return;
      owned = next;
      previous.forEach(id => {
        if (!next.has(id)) cancel(entryFor(id));
      });
      next.forEach(id => {
        if (previous.has(id)) return;
        const entry = entryFor(id);
        if (!entry.error && (!entry.snapshot || isStale({ ...entry, pending: false }, observationNow(), true))) entry.nextAt = 0;
        schedule(id);
      });
      publish();
    },
    setActive(value: boolean) {
      if (value === active) return;
      active = value;
      if (active && online) restartOwned();
      if (!active) owned.forEach(id => cancel(entryFor(id)));
      publish();
    },
    setOnline(value: boolean) {
      if (value === online) return;
      online = value;
      if (online && active) restartOwned();
      if (!online) owned.forEach(id => cancel(entryFor(id)));
      publish();
    },
    async refresh(ids: readonly string[]) {
      const startedAt = now();
      if (startedAt < retryAt) return null;
      const jobs: Promise<Outcome>[] = [];
      new Set(ids).forEach(id => {
        const entry = entryFor(id);
        if (!canRun(id) || startedAt < entry.manualAt || entry.error === 'invalid' || entry.error === 'configuration') return;
        entry.manualAt = startedAt + MANUAL_COOLDOWN;
        jobs.push((entry.flight ?? start(id)).result);
      });
      if (!jobs.length) return null;
      const results = await Promise.all(jobs);
      const completed = results.filter(result => result !== 'cancelled');
      if (!completed.length) return null;
      return completed.every(result => result === 'success') ? 'success' : 'failure';
    },
    dispose() {
      owned.forEach(id => cancel(entryFor(id)));
      owned.clear();
      listeners.clear();
    },
  };
}
