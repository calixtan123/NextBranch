/** Server-relative departure timing, independent of a device's adjustable wall clock. */
export type ResponseTiming = {
  receivedAt: number;
  serverAtReceipt: number;
  uncertaintyMs: number;
  approximate: boolean;
  suspended?: boolean;
};
type FeedTime = { fetchedAt?: string; liveState?: string };
type TimedResponse = {
  observedAt: string;
  generatedAt?: string;
  timing?: ResponseTiming;
  catalogue?: { feeds?: readonly FeedTime[] };
};

/**
 * Anchors validated server time to receipt on the consumer's elapsed clock.
 *
 * Parameters
 * ----------
 * response : object
 *     Validated timestamps; legacy servers use observedAt as an approximation.
 * receivedAt : number
 *     Receipt in the same elapsed clock used when displaying this snapshot.
 * durationMs : number
 *     Full request duration, including transport and body parsing. All of it is
 *     added conservatively: this can shorten countdowns by up to that duration.
 *
 * Returns
 * -------
 * object
 *     A new response with a local timing anchor. Legacy cached age cannot be
 *     reconstructed without generatedAt; no device wall time is substituted.
 *
 * Raises
 * ------
 * RangeError
 *     If the clock or validated server reference is not finite.
 */
export function anchorResponse<T extends TimedResponse>(response: T, receivedAt: number, durationMs: number): T & { timing: ResponseTiming } {
  const reference = Date.parse(response.generatedAt ?? response.observedAt);
  if (![reference, receivedAt, durationMs].every(Number.isFinite) || durationMs < 0) {
    throw new RangeError('Invalid response timing');
  }
  return { ...response, timing: {
    receivedAt, serverAtReceipt: reference + durationMs, uncertaintyMs: durationMs,
    approximate: response.generatedAt === undefined,
  } };
}

/**
 * Returns conservative server milliseconds for one snapshot and elapsed sample.
 * Unanchored projections retain their caller-injected absolute fixture clock.
 * Suspended or regressed clocks expire predictions until a new response arrives.
 *
 * Parameters
 * ----------
 * response : object
 *     Snapshot carrying its optional local timing anchor.
 * elapsed : number
 *     Current sample from the anchor's elapsed clock.
 *
 * Returns
 * -------
 * number
 *     Server milliseconds, or Infinity when elapsed time is unknown.
 */
export function responseTime(response: Pick<TimedResponse, 'timing'>, elapsed: number): number {
  const timing = response.timing;
  if (!timing) return elapsed;
  if (timing.suspended || !Number.isFinite(elapsed) || elapsed < timing.receivedAt) return Infinity;
  return timing.serverAtReceipt + elapsed - timing.receivedAt;
}

/**
 * Returns the oldest selected successful feed age using the snapshot's reference.
 * Missing feed times use observedAt, preserving compatibility with old servers.
 *
 * Parameters
 * ----------
 * response : object
 *     Validated snapshot and source timestamps.
 * elapsed : number
 *     Current sample from the anchor's elapsed clock.
 * feeds : object[], optional
 *     Relevant feeds; defaults to all feeds in the snapshot.
 *
 * Returns
 * -------
 * number
 *     Nonnegative age in milliseconds, or Infinity until suspension recovery.
 */
export function responseAge(response: TimedResponse, elapsed: number, feeds = response.catalogue?.feeds ?? []): number {
  const times = feeds.filter(feed => feed.liveState !== 'unavailable')
    .map(feed => Date.parse(feed.fetchedAt ?? response.observedAt));
  const source = times.length ? Math.min(...times) : Date.parse(response.observedAt);
  return Math.max(0, responseTime(response, elapsed) - source);
}

/**
 * Retains data while marking elapsed time across suspension as unknown until recovery.
 *
 * Parameters
 * ----------
 * response : object
 *     Snapshot to invalidate without changing the caller's copy.
 *
 * Returns
 * -------
 * object
 *     Snapshot with its anchor suspended, or the original unanchored fixture.
 */
export function suspendResponse<T extends TimedResponse>(response: T): T {
  return response.timing ? { ...response, timing: { ...response.timing, suspended: true } } : response;
}
