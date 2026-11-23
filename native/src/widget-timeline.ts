/** Projects the app's saved-platform boards and their expiry into WidgetKit timelines. */
import type { CatalogueService } from '../../src/lib/catalogue/schema';
import { responseAge, responseTime } from '../../src/lib/northern/response-time';
import { londonTime } from '../../src/lib/northern/time';
import { boardRows, boardStatus, departureIdentity } from './board-model';
import { boardPalette } from './board-palette';
import type { Catalogue, Selection } from './catalogue';
import type { FailureKind, Snapshot } from './api';
import { lineColour, lineLabels, platformPickerTitle } from './line-presentation';
import type { InterfaceTheme, Style } from './preferences';
import { FRESH_FOR } from './station-owner';

export const widgetWaitingMessage = 'Waiting for fresh departures';
const noDepartures = 'No upcoming departures';

export const initialWidgetBoard: WidgetBoard = { station: 'NextBranch', rows: [], message: 'Save a platform in NextBranch' };
type Service = Pick<CatalogueService, 'line_id' | 'line_name'>;
export type WidgetPage = {
  key: string; selection: Selection; board: WidgetBoard; review?: boolean;
  services?: readonly Service[]; relevantFeeds: readonly { lineId: string; stopAreaId: string }[];
};
export type WidgetConfiguration = { pages: WidgetPage[]; apiOrigin?: string };

type Departure = { id: string; identity: string; time: string; expiresAt: number };
export type WidgetBoard = {
  station: string; platform?: string; rows: Departure[]; message?: string;
  expiresAt?: number; lineMarkers?: { name: string; colour: string }[];
  style?: Style; colors?: typeof boardPalette[Style]; interfaceTheme?: InterfaceTheme;
};
type BoardInput = {
  selection: Selection; catalogue: Pick<Catalogue, 'has'>; stationName: string; style: Style; interfaceTheme?: InterfaceTheme;
  state: { snapshot?: Snapshot; error?: FailureKind | null; pending: boolean };
  online: boolean; limited?: boolean; observationNow: number; wallNow: number;
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
  observationNow, wallNow, services, relevantFeeds = [],
}: BoardInput): WidgetBoard {
  const heading = {
    station: stationName, platform: platformPickerTitle(selection.direction, selection.platform),
    lineMarkers: widgetLineMarkers(services),
    style, colors: boardPalette[style], ...(interfaceTheme ? { interfaceTheme } : {}),
  };
  if (!catalogue.has(selection)) return { ...heading, rows: [], message: 'Review this platform in NextBranch' };
  const { snapshot } = state;
  if (snapshot?.station.id !== selection.stationId) return { ...heading, rows: [], message: widgetWaitingMessage };
  const status = boardStatus({ ...state, error: state.error ?? null }, observationNow, online, relevantFeeds, limited);
  const feeds = snapshot.catalogue?.feeds?.filter(feed =>
    relevantFeeds.some(service => service.lineId === feed.lineId && service.stopAreaId === feed.stopAreaId));
  const age = responseAge(snapshot, observationNow, feeds?.length ? feeds : undefined);
  if (status.tone !== 'success' || age >= FRESH_FOR) return { ...heading, rows: [], message: widgetWaitingMessage };

  const sourceNow = responseTime(snapshot, observationNow);
  const rows = boardRows(snapshot, selection, observationNow, 3, 'upcoming').map(row => ({
    id: row.id, identity: departureIdentity(row, services), time: londonTime(row.expectedArrival),
    expiresAt: Math.floor(wallNow + Date.parse(row.expectedArrival) - sourceNow),
  }));
  return { ...heading, rows, expiresAt: Math.floor(wallNow + FRESH_FOR - age),
    ...(rows.length ? {} : { message: noDepartures }),
  };
}

/** Schedules train removal and an expired state without any widget network request. */
export function widgetTimeline(board: WidgetBoard, now: number): { date: Date; props: WidgetBoard }[] {
  const { station, platform, style, colors, interfaceTheme, lineMarkers, expiresAt } = board;
  const expired: WidgetBoard = { station, platform, style, colors, interfaceTheme, lineMarkers, rows: [], message: widgetWaitingMessage };
  if (expiresAt === undefined) return [{ date: new Date(now), props: board }];
  if (expiresAt <= now) return [{ date: new Date(now), props: expired }];

  const removals = [...new Set(board.rows.map(row => row.expiresAt))]
    .filter(time => time > now && time < expiresAt).sort((a, b) => a - b);
  return [...[now, ...removals].map(time => {
    const rows = board.rows.filter(row => row.expiresAt > time);
    const props = rows.length ? { ...board, rows } : { ...board, rows, message: noDepartures };
    return { date: new Date(time), props };
  }), { date: new Date(expiresAt), props: expired }];
}
