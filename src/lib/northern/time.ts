/** Shared arrival clocks, countdown formatting and London wall-clock labels. */
export const REFRESH_SECONDS = 30; export const DEPARTED_GRACE = 30; export const MAX_AGE = 180; export const MAX_FUTURE_SKEW = 90;
/** Returns exact seconds so minute rounding and departed expiry retain millisecond precision. */
export function remainingSeconds(expected: string | Date, now = new Date()) {
  return (new Date(expected).getTime() - now.getTime()) / 1000;
}

/** Returns whole snapshot seconds for existing API and ETA consumers. */
export function secondsToOrigin(expected: string | Date, now = new Date()) {
  return Math.round(remainingSeconds(expected, now));
}

/** Rounds once to nearest minutes, with half-up ties and inclusive departed grace. */
export function displayCountdown(seconds: number) {
  if (seconds < -DEPARTED_GRACE) return 'Departed';
  if (seconds < 30) return 'Due';
  return `${Math.round(seconds / 60)} min`;
}
/** Formats an ISO arrival as London local time. */
export function londonTime(iso: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
