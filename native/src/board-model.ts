/** Projects native departure display fields while preserving source predictions and matching. */
import { branchLabel, normalizeTowards } from '../../src/lib/northern/route';
import { DEPARTED_GRACE, displayCountdown, secondsToOrigin } from '../../src/lib/northern/time';
import { lines, type CatalogueService } from '../../src/lib/catalogue/schema';
import { FRESH_FOR, type createStationOwner } from './station-owner';
import { glyphs } from './glyphs';
import type { Snapshot } from './api';
import type { Selection } from './catalogue';
import type { Style } from './preferences';

/** Reads only an advertised via clause, preserving names beyond the two Northern aliases. */
function displayVia(value: string | null | undefined): string {
  const advertised = value?.trim().replace(/\s+/g, ' ');
  const via = advertised?.match(/\bvia\s+(.+)$/i);
  if (!via) return '';
  const compact = /^(?:bank|cx|charing\s+cross)$/i.test(via[1])
    ? branchLabel(normalizeTowards(advertised)) : null;
  return `via ${compact ?? via[1]}`;
}

/** Projects an exact physical platform before sorting and taking its visible row limit. */
export function boardRows(snapshot: Snapshot | undefined, selection: Selection, now: number, limit: 3 | 5) {
  if (snapshot?.station.id !== selection.stationId) return [];
  const clock = new Date(now);
  return snapshot.platforms
    .filter(group => selection.physicalPlatformId ? group.physicalPlatformId === selection.physicalPlatformId :
      group.physicalPlatformId !== null && group.platform === selection.platform && group.direction === selection.direction)
    .flatMap(group => group.departures)
    .filter(row => Date.parse(row.expectedArrival) + DEPARTED_GRACE * 1000 >= now)
    .map(row => ({ ...row, seconds: secondsToOrigin(row.expectedArrival, clock) }))
    .sort((a, b) => Date.parse(a.expectedArrival) - Date.parse(b.expectedArrival) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(row => {
      const destination = row.destinationName?.trim().replace(/\s+/g, ' ')
        .replace(/(?:^|\s+)(?:Underground|Rail) Station(?=\s*(?:via\b|$))/i, (suffix, offset, name) =>
          /\bvia\b/i.test(name.slice(0, offset)) ? suffix : '').trim() || 'Unknown destination';
      const via = displayVia(row.towards);
      const branch = via.toLowerCase() === displayVia(destination).toLowerCase() ? '' : via;
      return {
        id: row.id,
        lineId: row.lineId,
        destination,
        branch,
        countdown: displayCountdown(row.seconds),
        expectedArrival: row.expectedArrival,
      };
    });
}

/**
 * Formats a departure's destination, actual TfL line and advertised via wording.
 *
 * Parameters
 * ----------
 * row : departure row
 *     Display projection retaining the feed's explicit line identity.
 * services : published services, optional
 *     Platform memberships used to identify shared TfL platforms and published names.
 *
 * Returns
 * -------
 * string
 *     The same complete identity for visual and accessible presentation.
 */
export function departureIdentity(
  row: Pick<ReturnType<typeof boardRows>[number], 'lineId' | 'destination' | 'branch'>,
  services: readonly Pick<CatalogueService, 'line_id' | 'line_name'>[] = [],
): string {
  const tflIds = new Set(services.filter(service => service.line_id !== 'national-rail' &&
    Object.hasOwn(lines, service.line_id)).map(service => service.line_id));
  const id = row.lineId;
  const showLine = id && id !== 'national-rail' && Object.hasOwn(lines, id) &&
    (id === 'circle' || id === 'hammersmith-city' || tflIds.size > 1);
  const lineName = showLine
    ? services.find(service => service.line_id === id)?.line_name ?? lines[id as keyof typeof lines][0] : '';
  const viaStart = row.destination.search(/\s+via\s+/i);
  let destination = viaStart < 0 ? row.destination : row.destination.slice(0, viaStart);
  const embeddedVia = viaStart < 0 ? '' : row.destination.slice(viaStart).trim();
  const existingSuffix = lineName && [lineName, `${lineName.replace(/ line$/i, '')} Line`,
    ...(id === 'hammersmith-city' ? ['H&C Line', 'H&C'] : [])]
    .map(name => ` (${name.toLowerCase()})`)
    .find(suffix => destination.toLowerCase().endsWith(suffix));
  if (existingSuffix) destination = destination.slice(0, -existingSuffix.length).trim();
  const branch = displayVia(embeddedVia).toLowerCase() === displayVia(row.branch).toLowerCase() ? '' : row.branch;
  return [destination + (lineName ? ` (${lineName})` : ''), embeddedVia, branch].filter(Boolean).join(' ');
}

/** Counts current unresolved physical identities, including legacy unknown tuples. */
export function unassignedCount(snapshot: Snapshot | undefined, now: number): number {
  return snapshot?.platforms
    .filter(group => group.physicalPlatformId === null || (!group.physicalPlatformId && (!group.platform || !group.direction)))
    .flatMap(group => group.departures)
    .filter(row => Date.parse(row.expectedArrival) + DEPARTED_GRACE * 1000 >= now).length ?? 0;
}

/** Uses the pinned glyphs only where they can preserve the complete readable text. */
export function layoutFor(style: Style, fontScale: number, value: string): 'matrix' | 'text' {
  return style === 'amber' && fontScale <= 1.15 && value.length > 0 &&
    [...value].every(character => Object.hasOwn(glyphs, character.toUpperCase())) ? 'matrix' : 'text';
}

export const matrixDotSize = 1.72;
const dotGap = .6;
// Keep rendering, width measurement and wrapping on the same character spacing.
const glyphGap = 3;
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

/**
 * Projects connection and selected-feed freshness independently of platform mapping.
 *
 * Parameters
 * ----------
 * state : station state
 *     Cached successful response and latest request outcome.
 * now : number
 *     Current observation clock in milliseconds.
 * online : boolean
 *     Current connectivity.
 * relevantFeeds : feed keys, optional
 *     Supported services for the selected physical platform.
 *
 * Returns
 * -------
 * object
 *     Semantic dot tone and meaningful screen-reader status.
 */
export function boardStatus(
  state: ReturnType<ReturnType<typeof createStationOwner>['get']>, now: number, online: boolean,
  relevantFeeds: readonly { lineId: string; stopAreaId: string }[] = [],
): { tone: 'success' | 'warning' | 'danger' | 'dim'; label: string } {
  if (!online) return { tone: 'danger', label: 'Offline. Predictions may be outdated' };
  if (state.error === 'invalid') return { tone: 'danger', label: 'Station unavailable. Review your selection' };
  if (state.error === 'configuration') return { tone: 'danger', label: 'Live departures are unavailable' };
  if (state.error) return { tone: 'danger', label: 'Departures request failed. Predictions may be outdated' };
  const feeds = state.snapshot?.catalogue?.feeds?.filter(feed =>
    relevantFeeds.some(service => service.lineId === feed.lineId && service.stopAreaId === feed.stopAreaId)) ?? [];
  const unavailable = feeds.filter(feed => feed.liveState === 'unavailable').length;
  if (unavailable) return unavailable === feeds.length
    ? { tone: 'danger', label: 'Live departures temporarily unavailable' }
    : { tone: 'warning', label: 'Some live departures temporarily unavailable' };
  if (!state.snapshot) return { tone: 'dim', label: 'Loading departures' };
  if (now - Date.parse(state.snapshot.observedAt) > FRESH_FOR) {
    return { tone: 'warning', label: 'Departures are over 30 seconds old' };
  }
  const stale = feeds.filter(feed => feed.freshness === 'stale').length;
  if (stale) {
    return { tone: 'warning', label: stale === feeds.length
      ? 'No recent departures available' : 'No recent departures available for some services' };
  }
  return { tone: 'success', label: 'Live departures up to date' };
}
