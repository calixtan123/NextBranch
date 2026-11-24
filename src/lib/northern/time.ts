/** Shared arrival clocks, countdown formatting and London wall-clock labels. */
const SECONDS_PER_MINUTE = 60;

export const REFRESH_SECONDS = 30; export const DEPARTED_GRACE = 30; export const MAX_AGE = 180; export const MAX_FUTURE_SKEW = 90;
/** Returns exact seconds so minute rounding and departed expiry retain millisecond precision.
 *
 * Parameters
 * ----------
 * expected : string or Date
 *     Expected arrival timestamp.
 * now : Date or number, optional
 *     Current time as a Date or epoch milliseconds; defaults to the current time.
 *
 * Returns
 * -------
 * number
 *     Signed fractional seconds until arrival, or NaN if either date is invalid.
 */
export function remainingSeconds(expected: string | Date, now: Date | number = new Date()) {
  const milliseconds = typeof now === 'number' ? now : now.getTime();
  return (new Date(expected).getTime() - milliseconds) / 1000;
}

/** Returns whole snapshot seconds for existing API and ETA consumers. */
export function secondsToOrigin(expected: string | Date, now = new Date()) {
  return Math.round(remainingSeconds(expected, now));
}

/** Rounds once to nearest minutes, with half-up ties and inclusive departed grace. */
export function displayCountdown(seconds: number) {
  if (seconds < -DEPARTED_GRACE) return 'Departed';
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return minutes <= 0 ? 'Due' : `${minutes} min`;
}
/** Finds the first whole millisecond after the current rounded minute decreases. */
export function nextCountdownChange(expectedAt: number, now: number): number | undefined {
  const minuteMs = SECONDS_PER_MINUTE * 1000;
  const minutes = Math.round((expectedAt - now) / minuteMs);
  if (minutes > 0) return Math.floor(expectedAt - (minutes - 0.5) * minuteMs) + 1;
}
/** Formats an ISO arrival as London local time. */
export function londonTime(iso: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
