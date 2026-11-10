import { z } from 'zod';
import { catalogueResponseSchema } from '../../src/lib/catalogue/capability';
import { REFRESH_SECONDS } from '../../src/lib/northern/time';

const timestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const exactLabel = z.string().min(1).refine(value => value === value.trim());
const departure = z.object({
  id: exactLabel,
  lineId: exactLabel.optional(),
  destinationName: z.string().nullable(),
  expectedArrival: timestamp,
  secondsToStation: z.number().finite(),
  towards: z.string().nullable(),
});
const snapshot = z.object({
  station: z.object({ id: z.string().min(1), name: z.string().trim().min(1) }),
  observedAt: timestamp,
  newestPredictionGeneratedAt: timestamp.nullable(),
  refreshAfterSeconds: z.number().int().positive().optional().default(REFRESH_SECONDS),
  catalogue: catalogueResponseSchema.optional(),
  platforms: z.array(z.object({
    physicalPlatformId: exactLabel.nullable().optional(),
    platform: exactLabel.nullable(),
    direction: z.enum(['Northbound', 'Southbound', 'Eastbound', 'Westbound']).nullable(),
    departures: z.array(departure),
  })),
});

export type Snapshot = z.infer<typeof snapshot>;
export type StationTransport = (stationId: string, signal: AbortSignal) => Promise<Snapshot>;
export type FailureKind = 'timeout' | 'invalid' | 'limited' | 'unavailable' | 'configuration';

/** Represents public request failures without passing server diagnostics to the UI. */
export class RequestFailure extends Error {
  constructor(readonly kind: FailureKind, readonly retryAfterSeconds = REFRESH_SECONDS) {
    super(kind);
  }
}

/** Validates the wire shape and matches the response to its requested station. */
export function decodeSnapshot(value: unknown, stationId: string): Snapshot {
  const parsed = snapshot.safeParse(value);
  if (!parsed.success || parsed.data.station.id !== stationId) throw new RequestFailure('unavailable');
  return parsed.data;
}

const retryDelay = (value: unknown): number | undefined => {
  const seconds = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
};

/** Creates a non-caching transport for one configured API origin. */
export function httpTransport(base: string | undefined, dev: boolean, request = fetch): StationTransport {
  let url: URL;
  try {
    url = new URL(base ?? '');
  } catch {
    throw new RequestFailure('configuration');
  }
  if (!((url.protocol === 'https:') || (dev && url.protocol === 'http:')) ||
      !url.hostname || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/' || (!dev && /^(localhost\.?|127\.|\[::1\]$)/i.test(url.hostname))) {
    throw new RequestFailure('configuration');
  }
  return async (stationId, signal) => {
    const endpoint = new URL('/api/departures', url);
    endpoint.searchParams.set('station', stationId);
    const response = await request(endpoint.toString(), {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
    });
    if (response.status === 400) throw new RequestFailure('invalid');
    if (response.status === 429) {
      const header = retryDelay(response.headers.get('Retry-After'));
      if (header) throw new RequestFailure('limited', header);
      const body = await response.json().catch(() => null);
      throw new RequestFailure('limited', retryDelay(body?.retryAfterSeconds));
    }
    if (!response.ok) throw new RequestFailure('unavailable');
    return decodeSnapshot(await response.json(), stationId);
  };
}
