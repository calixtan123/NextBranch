export const REFRESH_SECONDS = 30; export const DEPARTED_GRACE = 30; export const MAX_AGE = 180; export const MAX_FUTURE_SKEW = 90;
export function secondsToOrigin(expected: string | Date, now = new Date()) { return Math.round((new Date(expected).getTime() - now.getTime()) / 1000); }
export function displayCountdown(seconds: number) { if (seconds <= 0 && seconds >= -DEPARTED_GRACE) return 'Due'; if (seconds < -DEPARTED_GRACE) return 'Departed'; return `${Math.ceil(seconds / 60)} min`; }
export function londonTime(iso: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
