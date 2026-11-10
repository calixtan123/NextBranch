import { branchLabel, normalizeTowards } from '../../src/lib/northern/route';
import { DEPARTED_GRACE, displayCountdown, secondsToOrigin } from '../../src/lib/northern/time';
import type { Snapshot } from './api';
import type { Selection } from './catalogue';
import type { Style } from './preferences';

/** Projects an exact physical platform before sorting and taking its visible row limit. */
export function boardRows(snapshot: Snapshot | undefined, selection: Selection, now: number, limit: 3 | 5) {
  if (snapshot?.station.id !== selection.stationId) return [];
  const clock = new Date(now);
  return snapshot.platforms
    .filter(group => group.platform === selection.platform && group.direction === selection.direction)
    .flatMap(group => group.departures)
    .filter(row => Date.parse(row.expectedArrival) + DEPARTED_GRACE * 1000 >= now)
    .map(row => ({ ...row, seconds: secondsToOrigin(row.expectedArrival, clock) }))
    .sort((a, b) => Date.parse(a.expectedArrival) - Date.parse(b.expectedArrival) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(row => {
      const advertised = row.towards?.trim();
      const via = advertised?.match(/\bvia\s+(.+)$/i);
      const compact = via && /^(?:bank|cx|charing\s+cross)$/i.test(via[1])
        ? branchLabel(normalizeTowards(advertised)) : null;
      const branch = via ? `via ${compact ?? via[1]}` : 'Branch unavailable';
      return {
        id: row.id,
        destination: row.destinationName?.trim() || 'Unknown destination',
        branch,
        countdown: displayCountdown(row.seconds),
        expectedArrival: row.expectedArrival,
      };
    });
}

/** Counts visible predictions that lack a confirmed platform or direction. */
export function unassignedCount(snapshot: Snapshot | undefined, now: number): number {
  return snapshot?.platforms
    .filter(group => !group.platform || !group.direction)
    .flatMap(group => group.departures)
    .filter(row => Date.parse(row.expectedArrival) + DEPARTED_GRACE * 1000 >= now).length ?? 0;
}

/** Uses the pinned glyphs only where they can preserve the complete readable text. */
export function layoutFor(style: Style, fontScale: number, value: string): 'matrix' | 'text' {
  return style === 'amber' && fontScale <= 1.15 && /^[A-Z0-9:. -]+$/i.test(value) ? 'matrix' : 'text';
}

export const matrixDotSize = 1.72;
const dotGap = .6;
const glyphGap = 1.65;
export const matrixDotStep = matrixDotSize + dotGap;
const glyphWidth = 5 * matrixDotSize + 4 * dotGap;
export const glyphAdvance = glyphWidth + glyphGap;
export const glyphHeight = 7 * matrixDotSize + 6 * dotGap;

function widthForGlyphs(count: number, scale: number) {
  return count > 0 ? (count * glyphAdvance - glyphGap) * scale : 0;
}

export function matrixWidth(value: string, scale: number) {
  return widthForGlyphs(value.length, scale);
}

export function wrapMatrix(value: string, width: number, scale: number) {
  // Recheck the rounded estimate in points so an exact fit survives floating-point division.
  const estimate = Math.round((width / scale + glyphGap) / glyphAdvance);
  const capacity = Math.max(1, widthForGlyphs(estimate, scale) <= width ? estimate : estimate - 1);
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    if (line && line.length + word.length + 1 > capacity) {
      lines.push(line);
      line = '';
    }
    if (word.length > capacity) {
      for (let start = 0; start < word.length; start += capacity) lines.push(word.slice(start, start + capacity));
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
