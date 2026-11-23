import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/api';
import { createCatalogue, type Selection } from '../src/catalogue';
import { widgetBoard, widgetTimeline, type WidgetPage } from '../src/widget-timeline';
import { projectWidgetResponse, projectWidgetTimeline } from '../src/widget-refresh';

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
const project = (options: { snapshot?: Snapshot; online?: boolean; observationNow?: number } = {}) =>
  widgetBoard({
    selection, catalogue, stationName: station.name, style: 'amber', state: { snapshot, pending: false, ...options },
    online: options.online ?? true, observationNow: options.observationNow ?? now, wallNow: now,
  });

describe('saved platform widget timeline', () => {
  it('uses the exact saved platform, branch wording and next three future trains', () => {
    const board = project();

    expect(board).toMatchObject({
      station: 'Camden Town', platform: 'Southbound Platform 2', expiresAt: now + 50_000,
      lineMarkers: [{ name: 'Northern line', colour: '#000000' }],
      rows: [
        { id: 'next', identity: 'Morden via Bank', time: '09:00', expiresAt: now + 15_000 },
        { id: 'later', identity: 'Morden' },
        { id: 'third', identity: 'Morden' },
      ],
    });
    expect(board).not.toHaveProperty('updated');
    expect(board).not.toHaveProperty('validUntil');
  });

  it('drops individual departures at their predicted time and expires the whole board', () => {
    const timeline = widgetTimeline(project(), now);

    expect(timeline.map(entry => [entry.date.getTime(), entry.props.rows.map(row => row.id)])).toEqual([
      [now, ['next', 'later', 'third']],
      [now + 15_000, ['later', 'third']],
      [now + 30_000, ['third']],
      [now + 45_000, []],
      [now + 50_000, []],
    ]);
    expect(timeline.at(-1)?.props).toMatchObject({
      station: 'Camden Town', style: 'amber', message: 'Waiting for fresh departures',
    });
    expect(timeline.at(-1)?.props).not.toHaveProperty('expiresAt');
  });

  it('keeps a fresh empty board distinct from an offline or expired board', () => {
    expect(project({ snapshot: { ...snapshot, platforms: [] } })).toMatchObject({
      message: 'No upcoming departures', expiresAt: now + 50_000, rows: [],
    });
    expect(project({ online: false })).toMatchObject({ message: 'Waiting for fresh departures', rows: [] });
    expect(project({ observationNow: now + 60_000 })).toMatchObject({
      message: 'Waiting for fresh departures', rows: [],
    });
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

  it('keeps long Amber destinations, departure times and row numbers in the dot matrix', () => {
    // This is the shape already published by older app builds, including rows without a matrix.
    const identity = 'Battersea Power Station via Charing Cross';
    const board = { ...page.board, rows: [{ ...page.board.rows[0], identity }] };
    const [{ props }] = projectWidgetTimeline({ ...page, board }, null, now);

    expect(props.rows[0].identity).toBe(identity);
    expect(props.rows[0].destinationMatrix).toHaveLength(2);
    expect(props.rows[0].destinationMatrix?.map(line => line.map(bits => bits.length))).toEqual([
      Array(7).fill(161), Array(7).fill(77),
    ]);
    expect(props.rows[0].timeMatrix?.[0]).toMatch(/^[01]{29}$/);
    expect(props.ordinalMatrices?.[0]?.[0]).toBe('00100');
  });

  it('preserves destination text when Amber has no matching glyph', () => {
    const identity = 'Café';
    const board = { ...page.board, rows: [{ ...page.board.rows[0], identity }] };
    const [{ props }] = projectWidgetTimeline({ ...page, board }, null, now);

    expect(props.rows[0]).toMatchObject({ identity, timeMatrix: expect.any(Array) });
    expect(props.rows[0].destinationMatrix).toBeUndefined();
  });

  it('uses the server clock and preserves the original API fetch time on every redraw', () => {
    const response = { ...snapshot, generatedAt: new Date(now).toISOString() };
    const receivedAt = now + 120_000;
    const duration = 2_000;
    const live = projectWidgetResponse(page, response, receivedAt, duration, receivedAt);
    const later = projectWidgetResponse(page, response, receivedAt, duration, receivedAt + 20_000);
    expect(live?.style).toBe('amber');
    expect(live?.rows.map(row => row.id)).toEqual(['next', 'later', 'third']);
    expect(live?.expiresAt).toBe(receivedAt + 48_000);
    expect(later?.expiresAt).toBe(live?.expiresAt);
    expect(later?.rows.map(row => row.id)).toEqual(['later', 'third', 'fourth']);
    expect(projectWidgetResponse(page, response, receivedAt, duration, receivedAt + 48_000)?.rows).toEqual([]);
  });

  it('rejects an invalid or wrong-station response and excludes stale selected feeds', () => {
    expect(projectWidgetResponse(page, {}, now, 0, now)).toBeNull();
    expect(projectWidgetResponse(page, { ...snapshot, station: { ...station, id: 'other' } }, now, 0, now)).toBeNull();
    const selectedFeed = { lineId: 'northern', stopAreaId: station.id };
    const response = { ...snapshot, generatedAt: new Date(now).toISOString(), catalogue: {
      stationId: station.id, liveState: 'partial', platforms: [], feeds: [
        { ...selectedFeed, liveState: 'unavailable' },
      ],
    } };
    expect(projectWidgetResponse({ ...page, relevantFeeds: [selectedFeed] }, response, now, 0, now)?.rows).toEqual([]);
  });

  it('refreshes an expired board from the API and preserves its saved appearance', () => {
    const receivedAt = now + 120_000;
    const body = { ...snapshot, generatedAt: new Date(now).toISOString() };
    const modernPage = { ...page, board: { ...page.board, style: 'modern' as const, interfaceTheme: 'dark' as const } };
    const timeline = projectWidgetTimeline(modernPage, { body, receivedAt, duration: 0 }, receivedAt);

    expect(timeline[0].props).toMatchObject({ station: 'Camden Town', style: 'modern', interfaceTheme: 'dark',
      rows: [{ id: 'next' }, { id: 'later' }, { id: 'third' }] });
    expect(timeline[0].props.rows.every(row => !row.destinationMatrix && !row.timeMatrix)).toBe(true);
    expect(timeline[0].props.ordinalMatrices).toBeUndefined();
    expect(timeline.at(-1)?.props).toMatchObject({ rows: [], message: 'Waiting for fresh departures' });
  });

  it('keeps a newer app board when the API response is unusable or older', () => {
    const body = { ...snapshot, observedAt: new Date(now - 20_000).toISOString(), generatedAt: new Date(now).toISOString() };
    const expected = projectWidgetTimeline(page, null, now);
    for (const response of [body, { ...body, station: { id: 'another', name: 'Another' } }]) {
      expect(projectWidgetTimeline(page, { body: response, receivedAt: now, duration: 0 }, now)).toEqual(expected);
    }
  });
});
