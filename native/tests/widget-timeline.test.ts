import { describe, expect, it } from 'vitest';
import { boardRows } from '../src/board-model';
import type { Snapshot } from '../src/api';
import { createCatalogue, type Selection } from '../src/catalogue';
import { widgetBoard, widgetTimeline, type WidgetPage } from '../src/widget-timeline';
import { projectWidgetResponse, projectWidgetTimeline, shouldCacheWidgetResponse } from '../src/widget-refresh';

const now = Date.parse('2026-11-23T09:00:00Z');
const station = { id: 'camden', name: 'Camden Town' };
const selection: Selection = {
  stationId: station.id, physicalPlatformId: 'camden-2', direction: 'Southbound', platform: '2',
};
const catalogue = createCatalogue({ version: 1, platforms: [selection] });
const arrival = (seconds: number, id: string, towards: string | null = null) => ({
  id, expectedArrival: new Date(now + seconds * 1000).toISOString(),
  destinationName: 'Morden Underground Station', secondsToStation: seconds, towards,
});
const snapshot: Snapshot = {
  station,
  observedAt: '2026-11-23T08:59:50Z',
  newestPredictionGeneratedAt: null,
  refreshAfterSeconds: 30,
  platforms: [
    { physicalPlatformId: 'camden-1', platform: '1', direction: 'Southbound', departures: [arrival(10, 'wrong')] },
    { physicalPlatformId: 'camden-2', platform: '2', direction: 'Southbound',
      departures: [arrival(-2, 'departed'), arrival(15, 'next', 'Morden via Bank'), arrival(30, 'later'),
        arrival(45, 'third'), arrival(90, 'fourth')] },
  ],
};
const project = ({ snapshot: response = snapshot, online = true, observationNow = now, wallNow = now }:
  { snapshot?: Snapshot; online?: boolean; observationNow?: number; wallNow?: number } = {}) =>
  widgetBoard({
    selection, catalogue, stationName: station.name, style: 'amber', state: { snapshot: response, pending: false },
    online, observationNow, wallNow,
  });

describe('saved platform widget timeline', () => {
  it('uses the exact saved platform, branch wording and the same countdown and arrival grace as the app', () => {
    const board = project();

    expect(board).toMatchObject({
      station: 'Camden Town', platform: 'Southbound Platform 2', expiresAt: now + 50_000,
      lineMarkers: [{ name: 'Northern line', colour: '#000000' }],
      rows: [
        { id: 'departed', identity: 'Morden', countdown: 'Due' },
        { id: 'next', identity: 'Morden via Bank', countdown: 'Due', expiresAt: now + 15_000 },
        { id: 'later', identity: 'Morden', countdown: '1 min' },
        { id: 'third' },
        { id: 'fourth' },
      ],
    });
    expect(board.rows.slice(0, 3).map(row => row.countdown)).toEqual(
      boardRows(snapshot, selection, now, 3).map(row => row.countdown));
  });

  it('matches the app immediately after a rounding boundary with a sub-millisecond server sample', () => {
    const selected = { ...snapshot.platforms[1], departures: [arrival(30, 'boundary')] };
    const timed = { ...snapshot, platforms: [selected], timing: {
      receivedAt: 100, serverAtReceipt: now, uncertaintyMs: 0, approximate: false,
    } };
    const observationNow = 100.5;
    const [entry] = widgetTimeline(project({ snapshot: timed, observationNow }), now);

    expect(boardRows(timed, selection, observationNow)[0].countdown).toBe('Due');
    expect(entry.props.rows[0].countdown).toBe('Due');
  });

  it('updates at the app rounding boundaries and freezes the final rows when the board expires', () => {
    const timeline = widgetTimeline(project(), now);

    expect(timeline.map(entry => [entry.date.getTime(), entry.props.rows.map(row => [row.id, row.countdown])])).toEqual([
      [now, [['departed', 'Due'], ['next', 'Due'], ['later', '1 min']]],
      [now + 1, [['departed', 'Due'], ['next', 'Due'], ['later', 'Due']]],
      [now + 28_001, [['next', 'Due'], ['later', 'Due'], ['third', 'Due']]],
      [now + 45_001, [['later', 'Due'], ['third', 'Due'], ['fourth', '1 min']]],
      [now + 50_000, [['later', 'Due'], ['third', 'Due'], ['fourth', '1 min']]],
    ]);
    const stale = timeline.at(-1)?.props;
    expect(stale).toMatchObject({ station: 'Camden Town', style: 'amber', staleAt: now + 50_000 });
    expect(stale?.message).toBeUndefined();
    expect(widgetTimeline(project(), now + 360_000)[0].props).toEqual(stale);
  });

  it('keeps the last visible train if all predictions time out before the data expires', () => {
    const board = project();
    const short = { ...board, rows: board.rows.slice(0, 1) };
    const saved = widgetTimeline(short, now + 90_000)[0].props;

    expect(saved).toMatchObject({ staleAt: now + 28_001, rows: [{ id: 'departed', countdown: 'Due' }] });
  });

  it('keeps a confirmed empty board distinct from a board with no response yet', () => {
    const empty = project({ snapshot: { ...snapshot, platforms: [] } });
    expect(empty).toMatchObject({ message: 'No upcoming departures', expiresAt: now + 50_000, rows: [] });
    expect(widgetTimeline(empty, now + 60_000)[0].props).toMatchObject({
      message: 'No upcoming departures', staleAt: now + 50_000, rows: [],
    });
    expect(project({ online: false })).toMatchObject({ message: 'No departures available', rows: [] });
  });

  it('uses absolute arrival instants across the London daylight-saving clock change', () => {
    const start = Date.parse('2026-10-25T01:59:00+01:00');
    const [other, selected] = snapshot.platforms;
    const timed = { ...snapshot, observedAt: new Date(start).toISOString(), platforms: [other, {
      ...selected, departures: [{ ...arrival(120, 'dst'), expectedArrival: '2026-10-25T01:01:00+00:00' }],
    }] };

    const board = project({ snapshot: timed, observationNow: start, wallNow: start });

    expect(board.rows).toMatchObject([{ id: 'dst', countdown: '2 min', expiresAt: start + 120_000 }]);
    expect(boardRows(timed, selection, start, 3)[0]?.countdown).toBe(board.rows[0]?.countdown);
    expect(widgetTimeline(board, start + 60_000)[0].props.rows[0]?.countdown).toBe('1 min');
  });

  it('does not expose predictions for a platform the catalogue can no longer verify', () => {
    const board = widgetBoard({
      selection: { ...selection, physicalPlatformId: 'missing' }, catalogue, stationName: station.name, style: 'modern',
      state: { snapshot, pending: false }, online: true, observationNow: now, wallNow: now,
    });

    expect(board).toMatchObject({ style: 'modern', message: 'Review this platform in NextBranch', rows: [] });
  });
});

describe('widget refresh response', () => {
  const page: WidgetPage = { key: 'camden-2', selection, board: project(), relevantFeeds: [] };

  it('restores the app line markers from an older snapshot and keeps them after expiry', () => {
    const board = { ...page.board, lineMarkers: undefined };
    const services = [
      { line_id: 'district', line_name: 'District line' },
      { line_id: 'piccadilly', line_name: 'Piccadilly line' },
    ] as const;
    const timeline = projectWidgetTimeline({ ...page, board, services }, null, now);
    const markers = [
      { name: 'District line', colour: '#00782A' },
      { name: 'Piccadilly line', colour: '#003688' },
    ];

    expect(timeline[0].props.lineMarkers).toEqual(markers);
    expect(timeline.at(-1)?.props.lineMarkers).toEqual(markers);
  });

  it('keeps long Amber destinations, countdowns and row numbers in the dot matrix', () => {
    // This is the shape already published by older app builds, including rows without a matrix.
    const identity = 'Battersea Power Station via Charing Cross';
    const board = { ...page.board, rows: [{ ...page.board.rows[0], identity }] };
    const [{ props }] = projectWidgetTimeline({ ...page, board }, null, now);

    expect(props.rows[0].identity).toBe(identity);
    expect(props.rows[0].destinationMatrix).toHaveLength(2);
    expect(props.rows[0].destinationMatrix?.map(line => line.map(bits => bits.length))).toEqual([
      Array(7).fill(161), Array(7).fill(77),
    ]);
    expect(props.rows[0].countdownMatrix?.[0]).toMatch(/^[01]{17}$/);
    expect(props.ordinalMatrices?.[0]?.[0]).toBe('00100');
  });

  it('preserves destination text when Amber has no matching glyph', () => {
    const identity = 'Café';
    const board = { ...page.board, rows: [{ ...page.board.rows[0], identity }] };
    const [{ props }] = projectWidgetTimeline({ ...page, board }, null, now);

    expect(props.rows[0]).toMatchObject({ identity, countdownMatrix: expect.any(Array) });
    expect(props.rows[0].destinationMatrix).toBeUndefined();
  });

  it('uses the server clock and preserves the original API fetch time on every redraw', () => {
    const response = { ...snapshot, generatedAt: new Date(now).toISOString() };
    const receivedAt = now + 120_000;
    const duration = 2_000;
    const live = projectWidgetResponse(page, response, receivedAt, duration);
    expect(live?.style).toBe('amber');
    expect(live?.rows.map(row => row.id)).toEqual(['departed', 'next', 'later', 'third', 'fourth']);
    expect(live?.expiresAt).toBe(receivedAt + 48_000);
    const [later] = projectWidgetTimeline(page, { body: response, receivedAt, duration }, receivedAt + 48_000);
    expect(later.props).toMatchObject({ staleAt: receivedAt + 48_000,
      rows: [{ id: 'later', countdown: 'Due' }, { id: 'third', countdown: 'Due' }, { id: 'fourth', countdown: '1 min' }],
    });
  });

  it('rejects an invalid or wrong-station response and excludes stale selected feeds', () => {
    expect(projectWidgetResponse(page, {}, now, 0)).toBeNull();
    expect(projectWidgetResponse(page, { ...snapshot, station: { ...station, id: 'other' } }, now, 0)).toBeNull();
    const selectedFeed = { lineId: 'northern', stopAreaId: station.id };
    const response = { ...snapshot, generatedAt: new Date(now).toISOString(), catalogue: {
      stationId: station.id, liveState: 'partial', platforms: [], feeds: [
        { ...selectedFeed, liveState: 'unavailable' },
      ],
    } };
    expect(projectWidgetResponse({ ...page, relevantFeeds: [selectedFeed] }, response, now, 0)).toBeNull();
  });

  it('refreshes an expired board from the API and preserves its saved appearance', () => {
    const receivedAt = now + 120_000;
    const body = { ...snapshot, generatedAt: new Date(now).toISOString() };
    const modernPage = { ...page, board: { ...page.board, style: 'modern' as const, interfaceTheme: 'dark' as const } };
    const timeline = projectWidgetTimeline(modernPage, { body, receivedAt, duration: 0 }, receivedAt);

    expect(timeline[0].props).toMatchObject({ station: 'Camden Town', style: 'modern', interfaceTheme: 'dark',
      rows: [{ id: 'departed' }, { id: 'next' }, { id: 'later' }] });
    expect(timeline[0].props.rows.every(row => !row.destinationMatrix && !row.countdownMatrix)).toBe(true);
    expect(timeline[0].props.ordinalMatrices).toBeUndefined();
    expect(timeline.at(-1)?.props).toMatchObject({
      rows: [{ id: 'later' }, { id: 'third' }, { id: 'fourth' }], staleAt: receivedAt + 50_000,
    });
  });

  it('keeps a newer app board when the API response is unusable or older', () => {
    const body = { ...snapshot, observedAt: new Date(now - 20_000).toISOString(), generatedAt: new Date(now).toISOString() };
    const expected = projectWidgetTimeline(page, null, now);
    for (const response of [body, { ...body, station: { id: 'another', name: 'Another' } }]) {
      expect(projectWidgetTimeline(page, { body: response, receivedAt: now, duration: 0 }, now)).toEqual(expected);
    }
  });

  it('only replaces a successful network cache entry with a newer usable board for that platform', () => {
    const observedAt = new Date(now).toISOString();
    const body = { ...snapshot, observedAt, generatedAt: observedAt };
    const cached = { body, receivedAt: now, duration: 0 };
    const later = new Date(now + 30_000).toISOString();

    expect(shouldCacheWidgetResponse(page, cached, { ...cached, body: {} })).toBe(false);
    expect(shouldCacheWidgetResponse(page, cached, {
      ...cached, receivedAt: now + 30_000,
      body: { ...body, observedAt: new Date(now - 5_000).toISOString(), generatedAt: later },
    })).toBe(false);
    expect(shouldCacheWidgetResponse(page, cached, {
      ...cached, receivedAt: now + 30_000,
      body: { ...body, observedAt: later, generatedAt: later, platforms: [] },
    })).toBe(true);
  });

  it('converts saved rows from earlier widget versions to countdowns on first render', () => {
    const { countdown, ...prediction } = page.board.rows[0];
    const legacy = { ...page, board: { ...page.board, rows: [{ ...prediction, time: '09:00' }] } };
    const [entry] = projectWidgetTimeline(legacy as unknown as WidgetPage, null, now);

    expect(entry.props.rows[0].countdown).toBe(countdown);
  });
});
