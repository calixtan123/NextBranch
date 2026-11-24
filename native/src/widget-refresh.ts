/** Projects widget API responses using the same matching and freshness rules as the app. */
import { anchorResponse } from '../../src/lib/northern/response-time';
import { decodeSnapshot, RequestFailure } from './api';
import { layoutFor, matrixWidth, wrapMatrix } from './board-model';
import { glyphs } from './glyphs';
import { initialWidgetBoard, widgetBoard, widgetLineMarkers, widgetTimeline, widgetUnavailableMessage,
  type WidgetBoard, type WidgetPage } from './widget-timeline';

type RenderedBoard = Omit<WidgetBoard, 'rows'> & {
  ordinalMatrices?: string[][];
  rows: (WidgetBoard['rows'][number] & { destinationMatrix?: string[][]; countdownMatrix?: string[] })[];
};
type WidgetResponse = { body: unknown; receivedAt: number; duration: number };

// A medium widget has room for two lines at this density. SwiftUI scales them to the actual width.
const amberLineWidth = matrixWidth(' '.repeat(28), 1);

/** Packs the app's 5×7 glyphs into seven bitmap strips, with one unlit dot separating characters. */
function matrix(value: string): string[] | undefined {
  if (layoutFor('amber', 1, value) !== 'matrix') return undefined;
  const characters = [...value].map(character => glyphs[character.toUpperCase()]);
  return glyphs.A.map((_, row) => characters.map(character => character[row]).join('0'));
}

/** Adds display-only glyphs after merging the persisted and newly fetched board data. */
function renderBoard(board: WidgetBoard): RenderedBoard {
  if (board.style !== 'amber' || !board.rows.length) return board;
  const ordinalMatrices = ['1', '2', '3'].map(value => matrix(value) ?? []);
  const rows = board.rows.map(row => {
    const lines = wrapMatrix(row.identity, amberLineWidth, 1);
    const matrices = lines.map(matrix);
    const destinationMatrix = matrices.length <= 2 && matrices.every(line => line !== undefined) ? matrices : undefined;
    return { ...row, destinationMatrix, countdownMatrix: matrix(row.countdown) };
  });
  return { ...board, rows, ordinalMatrices };
}

/** Validates a response and retains the original observation clock across redraws. */
export function projectWidgetResponse(
  page: WidgetPage, body: unknown, receivedAt: number, duration: number,
) {
  if (page.review || !page.board.style) return null;
  try {
    const snapshot = anchorResponse(decodeSnapshot(body, page.selection.stationId), receivedAt, duration);
    const board = widgetBoard({
      selection: page.selection, catalogue: { has: () => true }, stationName: page.board.station,
      style: page.board.style, interfaceTheme: page.board.interfaceTheme, state: { snapshot, pending: false },
      online: true, observationNow: receivedAt, wallNow: receivedAt, services: page.services, relevantFeeds: page.relevantFeeds,
    });
    return board.expiresAt === undefined ? null : board;
  } catch (error) {
    if (error instanceof RequestFailure || error instanceof RangeError) return null;
    throw error;
  }
}

function responseBoard(page: WidgetPage, response: WidgetResponse | null) {
  return response && projectWidgetResponse(page, response.body, response.receivedAt, response.duration);
}

/** Preserves a platform's last usable network data through transport, API and selected-feed failures. */
export function shouldCacheWidgetResponse(page: WidgetPage, previous: WidgetResponse | null, next: WidgetResponse) {
  const candidate = responseBoard(page, next);
  return (candidate?.expiresAt ?? 0) > (responseBoard(page, previous)?.expiresAt ?? 0);
}

/** Builds the selected platform timeline for the Swift WidgetKit provider. */
export function projectWidgetTimeline(page: WidgetPage | null, response: WidgetResponse | null, now: number) {
  const live = page && responseBoard(page, response);
  const cached = page ? { ...page.board, lineMarkers: page.board.lineMarkers ?? widgetLineMarkers(page.services) }
    : initialWidgetBoard;
  if (page && !page.review && cached.expiresAt === undefined) cached.message = widgetUnavailableMessage;
  const board = live && (live.expiresAt ?? 0) > (cached.expiresAt ?? 0) ? live : cached;
  return widgetTimeline(board, now).map(({ date, props }) => ({ timestamp: date.getTime(), props: renderBoard(props) }));
}
