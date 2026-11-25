/** Projects the app's saved-platform boards and their expiry into WidgetKit timelines. */
import type { CatalogueService } from '../../src/lib/catalogue/schema';
import { responseAge, responseTime } from '../../src/lib/northern/response-time';
import { DEPARTED_GRACE, displayCountdown, nextCountdownChange } from '../../src/lib/northern/time';
import { boardRows, boardStatus, departureIdentity } from './board-model';
import { boardPalette } from './board-palette';
import type { Catalogue, Selection } from './catalogue';
import type { FailureKind, Snapshot } from './api';
import { lineColour, lineLabels, platformPickerTitle } from './line-presentation';
import type { InterfaceTheme, MockPlan, Style } from './preferences';
import { FRESH_FOR } from './station-owner';

export const widgetUnavailableMessage = 'No departures available';
const noDepartures = 'No upcoming departures';
const visibleRows = 3;

export const initialWidgetBoard: WidgetBoard = { station: 'NextBranch', rows: [], message: 'Save a platform in NextBranch' };
type Service = Pick<CatalogueService, 'line_id' | 'line_name'>;
export type WidgetPage = {
  key: string; selection: Selection; board: WidgetBoard; review?: boolean;
  services?: readonly Service[]; relevantFeeds: readonly { lineId: string; stopAreaId: string }[];
};
export type WidgetConfiguration = { pages: WidgetPage[]; apiOrigin?: string; mockPlan?: MockPlan };

type Departure = { id: string; identity: string; countdown: string; expiresAt: number };
export type WidgetBoard = {
  station: string; platform?: string; rows: Departure[]; message?: string;
  expiresAt?: number; staleAt?: number; lineMarkers?: { name: string; colour: string }[];
  style?: Style; colors?: typeof boardPalette[Style]; interfaceTheme?: InterfaceTheme;
};
type BoardInput = {
  selection: Selection; catalogue: Pick<Catalogue, 'has'>; stationName: string; style: Style; interfaceTheme?: InterfaceTheme;
  state: { snapshot?: Snapshot; error?: FailureKind | null; pending: boolean };
  online: boolean; limited?: boolean; previous?: WidgetBoard; observationNow: number; wallNow: number;
  services?: readonly Service[];
  relevantFeeds?: readonly { lineId: string; stopAreaId: string }[];
};

/** Carries the app's ordered line names and swatch colours into SwiftUI. */
export function widgetLineMarkers(services?: readonly Service[]): NonNullable<WidgetBoard['lineMarkers']> {
  const labels = services ? lineLabels(services) : [{ id: 'northern', name: 'Northern line' }];
  return labels.map(({ id, name }) => ({ name, colour: lineColour(id) }));
}

/** Reuses the in-app identity, feed freshness and branch wording for one saved slot. */
export function widgetBoard({ selection, catalogue, stationName, style, interfaceTheme, state, online, limited,
  observationNow, wallNow, services, previous, relevantFeeds = [],
}: BoardInput): WidgetBoard {
  const heading = {
    station: stationName, platform: platformPickerTitle(selection.direction, selection.platform),
    lineMarkers: widgetLineMarkers(services),
    style, colors: boardPalette[style], ...(interfaceTheme ? { interfaceTheme } : {}),
  };
  if (!catalogue.has(selection)) return { ...heading, rows: [], message: 'Review this platform in NextBranch' };
  const fallback: WidgetBoard = previous?.expiresAt === undefined
    ? { ...heading, rows: [], message: widgetUnavailableMessage }
    : { ...previous, ...heading, staleAt: previous.staleAt ?? wallNow };
  const { snapshot } = state;
  if (snapshot?.station.id !== selection.stationId) return fallback;
  const status = boardStatus({ ...state, error: state.error ?? null }, observationNow, online, relevantFeeds, limited);
  const feeds = snapshot.catalogue?.feeds?.filter(feed =>
    relevantFeeds.some(service => service.lineId === feed.lineId && service.stopAreaId === feed.stopAreaId));
  const age = responseAge(snapshot, observationNow, feeds?.length ? feeds : undefined);
  if (status.tone !== 'success' || age >= FRESH_FOR) return fallback;

  const sourceNow = responseTime(snapshot, observationNow);
  // Retain the response's original rows. The timeline can advance them even when the app republishes.
  const rows = boardRows(snapshot, selection, snapshot.timing?.receivedAt ?? observationNow).map(row => ({
    id: row.id, identity: departureIdentity(row, services), countdown: row.countdown,
    expiresAt: wallNow + (Date.parse(row.expectedArrival) - sourceNow),
  }));
  return { ...heading, rows, expiresAt: Math.floor(wallNow + FRESH_FOR - age),
    ...(rows.length ? {} : { message: noDepartures }),
  };
}

/** Plans minute changes and retains the last visible prediction when a board goes stale. */
export function widgetTimeline(board: WidgetBoard, now: number): { date: Date; props: WidgetBoard }[] {
  if (board.expiresAt === undefined) return [{ date: new Date(now), props: board }];

  // The app still says Due at the end of the grace period; remove on the next millisecond.
  const removals = board.rows.map(row => Math.floor(row.expiresAt + DEPARTED_GRACE * 1_000) + 1);
  const lastRemoval = removals.length ? Math.max(...removals) : Infinity;
  const staleAt = Math.min(board.expiresAt, board.staleAt ?? Infinity, lastRemoval);
  const entry = (time: number) => {
    const clock = Math.min(time, staleAt - 1);
    const rows = board.rows.filter((_, index) => removals[index] > clock)
      .slice(0, visibleRows)
      .map(row => ({ ...row, countdown: displayCountdown((row.expiresAt - clock) / 1_000) }));
    return { date: new Date(time), props: { ...board, rows, staleAt } };
  };

  if (now >= staleAt) return [entry(now)];
  // A fresh board lasts at most a minute, so each row can change minutes at most once.
  const countdowns = board.rows.map((row, index) => {
    const visibleAt = Math.max(now, removals[index - visibleRows] ?? now);
    return nextCountdownChange(row.expiresAt, visibleAt);
  });
  const changes = [...new Set([...removals, ...countdowns])]
    .filter((time): time is number => time !== undefined && time > now && time < staleAt)
    .sort((a, b) => a - b);
  return [now, ...changes, staleAt].map(entry);
}
