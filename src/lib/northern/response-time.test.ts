/** Pure response clock regression coverage, shared by native and browser clients. */
import { expect, it } from 'vitest';
import { anchorResponse, responseAge, responseTime, suspendResponse } from './response-time';

const observedAt = '2026-09-16T12:00:00.000Z';
const server = Date.parse(observedAt);
it('uses generated time plus full request duration and elapsed time while preserving cache source ages', () => {
  const response = anchorResponse({ observedAt, generatedAt: new Date(server + 25_000).toISOString(), catalogue: { feeds: [
    { fetchedAt: observedAt, liveState: 'available' },
    { fetchedAt: new Date(server + 25_000).toISOString(), liveState: 'empty' },
    { liveState: 'unavailable' },
  ] } }, 80, 8_000);
  expect(responseTime(response, 2_080)).toBe(server + 35_000);
  expect(responseAge(response, 2_080)).toBe(35_000);
  expect(responseAge(response, 2_080, [response.catalogue.feeds[1]])).toBe(10_000);
  expect(response.timing).toMatchObject({ uncertaintyMs: 8_000, approximate: false });
});
it('documents the legacy cache approximation and retains explicit fixture time for unanchored projections', () => {
  const legacy = anchorResponse({ observedAt }, 100, 200);
  expect(legacy.timing.approximate).toBe(true);
  expect(responseAge(legacy, 1_100)).toBe(1_200);
  expect(responseTime({}, server)).toBe(server);
  expect(suspendResponse({ observedAt })).toEqual({ observedAt });
});
it('invalidates suspended or regressed elapsed clocks without consulting wall time', () => {
  const response = anchorResponse({ observedAt }, 100, 0);
  expect(responseTime(suspendResponse(response), 100)).toBe(Infinity);
  expect(responseAge(suspendResponse(response), 100)).toBe(Infinity);
  expect(responseTime(response, 99)).toBe(Infinity);
  expect(responseTime(response, NaN)).toBe(Infinity);
  expect(response.timing.suspended).toBeUndefined();
});
it.each([[NaN, 0], [0, Infinity], [0, -1]])('rejects invalid receipt %s or duration %s', (receipt, duration) => {
  expect(() => anchorResponse({ observedAt }, receipt, duration)).toThrow(RangeError);
});
it('rejects an invalid server reference rather than falling back to wall time', () => {
  expect(() => anchorResponse({ observedAt: 'invalid' }, 0, 0)).toThrow(RangeError);
});
