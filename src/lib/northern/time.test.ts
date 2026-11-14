import { describe, expect, it } from 'vitest';
import { displayCountdown, remainingSeconds, secondsToOrigin } from './time';

describe('countdown', () => {
  it.each([
    [29.999, 'Due'],
    [30, '1 min'],
    [61, '1 min'],
    [149, '2 min'],
    [149.999, '2 min'],
    [150, '3 min'],
    [151, '3 min'],
    [269.999, '4 min'],
    [270, '5 min'],
    [0, 'Due'],
    [-30, 'Due'],
    [-30.001, 'Departed'],
  ])('displays %s seconds as %s', (seconds, expected) => {
    expect(displayCountdown(seconds)).toBe(expected);
  });
});


describe('absolute arrival precision', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  it.each([
    [29_999, 'Due'], [30_000, '1 min'],
    [149_999, '2 min'], [150_000, '3 min'],
    [269_999, '4 min'], [270_000, '5 min'],
    [0, 'Due'], [-30_000, 'Due'], [-30_001, 'Departed'],
  ])('formats an absolute arrival %s milliseconds away as %s', (milliseconds, expected) => {
    const arrival = new Date(now.getTime() + milliseconds);
    expect(remainingSeconds(arrival.toISOString(), now)).toBe(milliseconds / 1000);
    expect(displayCountdown(remainingSeconds(arrival, now))).toBe(expected);
    expect(secondsToOrigin(arrival, now)).toBe(Math.round(milliseconds / 1000));
  });

  it('preserves invalid-date rejection through non-finite seconds', () => {
    expect(remainingSeconds('invalid', now)).toBeNaN();
    expect(secondsToOrigin('invalid', now)).toBeNaN();
  });
});
