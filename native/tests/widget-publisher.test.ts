/** Exercises saved-platform changes through the publisher and the real state owners. */
import { afterEach, expect, it, vi } from 'vitest';
import { selectionKey } from '../src/catalogue';
import { createDiscovery } from '../src/discovery';
import { fixtureRuntime } from '../src/fixture';
import { createPreferences } from '../src/preferences';
import { savedPlatformWidget } from '../src/SavedPlatformWidget';
import { createStationOwner } from '../src/station-owner';
import { connectSavedPlatformWidgets } from '../src/widget-publisher';
import type { WidgetConfiguration } from '../src/widget-timeline';

vi.mock('../src/SavedPlatformWidget', () => ({
  savedPlatformWidget: {
    getTimeline: vi.fn(async (): Promise<{ date: Date; props: WidgetConfiguration }[]> => []),
    updateSnapshot: vi.fn<(config: WidgetConfiguration) => void>(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('preserves the published platform board when the app restarts offline', async () => {
  vi.useFakeTimers();
  const fixture = fixtureRuntime('three-card-home', true);
  const storage = { getItem: async () => null, setItem: async () => {} };
  const preferences = createPreferences(storage, fixture.catalogue, Date.now, undefined, fixture.cards);
  const stations = createStationOwner(fixture.transport, () => performance.now(), fixture.now);
  stations.setOnline(false);
  const selection = fixture.cards[0];
  const board = {
    station: 'Colindale', rows: [{ id: 'saved', identity: 'Morden', countdown: '2 min', expiresAt: Date.now() + 120_000 }],
    expiresAt: Date.now() + 38_000,
  };
  vi.mocked(savedPlatformWidget.getTimeline).mockResolvedValueOnce([{ date: new Date(), props: {
    pages: [{ key: selectionKey(selection), selection, board, relevantFeeds: [] }],
  } }]);
  const panel = vi.mocked(savedPlatformWidget.updateSnapshot);
  const stop = connectSavedPlatformWidgets({
    preferences, stations, catalogue: fixture.catalogue, discovery: createDiscovery(), now: fixture.now, synthetic: true,
  });
  try {
    await preferences.load();
    stations.own([selection.stationId]);
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.mock.lastCall?.[0].pages[0]?.board).toMatchObject({
      rows: board.rows, expiresAt: board.expiresAt, staleAt: Date.now(),
    });
    expect(panel.mock.lastCall?.[0].pages[1]?.board.rows).toEqual([]);
  } finally {
    stop();
    stations.dispose();
  }
});

it('extends the widget timeline when a successful fixture refresh has the same observation time', async () => {
  vi.useFakeTimers();
  const fixture = fixtureRuntime('three-card-home', true);
  const storage = { getItem: async () => null, setItem: async () => {} };
  const preferences = createPreferences(storage, fixture.catalogue, Date.now, undefined, fixture.cards);
  const stations = createStationOwner(fixture.transport, () => performance.now(), fixture.now);
  const panel = vi.mocked(savedPlatformWidget.updateSnapshot);
  const latestExpiry = () => panel.mock.lastCall?.[0].pages[0]?.board.expiresAt ?? 0;
  const stop = connectSavedPlatformWidgets({
    preferences, stations, catalogue: fixture.catalogue, discovery: createDiscovery(), now: fixture.now, synthetic: true,
  });
  try {
    await preferences.load();
    const stationId = fixture.cards[0].stationId;
    stations.own([stationId]);
    await vi.advanceTimersByTimeAsync(0);
    const firstExpiry = latestExpiry();
    expect(firstExpiry).toBeGreaterThan(Date.now());

    await vi.advanceTimersByTimeAsync(1_000);
    expect(await stations.refresh([stationId])).toBe('success');

    expect(latestExpiry()).toBe(firstExpiry + 1_000);
  } finally {
    stop();
    stations.dispose();
  }
});

it('publishes a single widget with only the current saved platforms using only the app’s station requests', async () => {
  vi.useFakeTimers();
  const fixture = fixtureRuntime('three-card-home', true);
  const storage = { getItem: async () => null, setItem: async () => {} };
  const preferences = createPreferences(storage, fixture.catalogue, Date.now, undefined, fixture.cards);
  const transport = vi.fn(fixture.transport);
  const stations = createStationOwner(transport, () => performance.now(), fixture.now);
  const panel = vi.mocked(savedPlatformWidget.updateSnapshot);
  const currentBoards = () => panel.mock.lastCall?.[0].pages.map(page => page.board) ?? [];
  const stop = connectSavedPlatformWidgets({
    preferences, stations, catalogue: fixture.catalogue, discovery: createDiscovery(), now: fixture.now, synthetic: true,
  });
  try {
    await preferences.load();
    expect(transport).not.toHaveBeenCalled();
    stations.own(fixture.cards.map(card => card.stationId));
    await vi.advanceTimersByTimeAsync(0);
    const boards = currentBoards();
    expect(boards.map(board => [board?.station, board?.platform, Boolean(board?.rows.length)])).toEqual([
      ['Colindale', 'Southbound Platform A', true],
      ['Camden Town', 'Southbound Platform A', true],
      ['Camden Town', 'Southbound Platform B', true],
    ]);
    expect(transport).toHaveBeenCalledTimes(2);

    preferences.setStyle(selectionKey(fixture.cards[1]), 'modern');
    expect(currentBoards().map(board => board?.style)).toEqual(['amber', 'modern', 'amber']);
    expect(currentBoards()[1]?.rows).toEqual(boards[1]?.rows);

    preferences.setMode('modern');
    expect(currentBoards().map(board => board?.style)).toEqual(['modern', 'modern', 'modern']);
    preferences.setMode('custom');
    const mixedBoards = currentBoards();

    preferences.move(selectionKey(fixture.cards[2]), selectionKey(fixture.cards[0]));
    expect(currentBoards()).toEqual([mixedBoards[2], mixedBoards[0], mixedBoards[1]]);
    preferences.remove(selectionKey(fixture.cards[0]));
    expect(currentBoards()).toEqual([mixedBoards[2], mixedBoards[1]]);
    expect(panel.mock.lastCall?.[0].pages.map(page => page.key)).toEqual(
      [fixture.cards[2], fixture.cards[1]].map(selectionKey),
    );
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    stop();
    stations.dispose();
  }
});

it('publishes a bare Free lock and Pro pages without restoring cached boards on Free', async () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_API_URL', 'https://www.tfl.gov.uk');
  const fixture = fixtureRuntime('three-card-home', true);
  const storage = { getItem: async () => null, setItem: async () => {} };
  const preferences = createPreferences(storage, fixture.catalogue, Date.now, undefined, fixture.cards,
    undefined, undefined, { mockPlans: true });
  const transport = vi.fn(fixture.transport);
  const stations = createStationOwner(transport, () => performance.now(), fixture.now);
  stations.setActive(false);
  const panel = vi.mocked(savedPlatformWidget.updateSnapshot);
  const stop = connectSavedPlatformWidgets({
    preferences, stations, catalogue: fixture.catalogue, discovery: createDiscovery(), now: fixture.now, synthetic: false,
  });
  try {
    await preferences.load();
    expect(panel.mock.lastCall?.[0]).toEqual({ mockPlan: 'free', pages: [] });
    expect(savedPlatformWidget.getTimeline).not.toHaveBeenCalled();

    preferences.setMockPlan('pro');
    expect(panel.mock.lastCall?.[0]).toMatchObject({ mockPlan: 'pro', apiOrigin: 'https://www.tfl.gov.uk' });
    expect(panel.mock.lastCall?.[0].pages.map(({ key }) => key)).toEqual(fixture.cards.map(selectionKey));

    preferences.setMockPlan('free');
    expect(panel.mock.calls.map(([config]) => config.mockPlan)).toEqual(['free', 'pro', 'free']);
    expect(panel.mock.lastCall?.[0]).toEqual({ mockPlan: 'free', pages: [] });
    expect(transport).not.toHaveBeenCalled();
  } finally {
    stop();
    stations.dispose();
    vi.unstubAllEnvs();
  }
});

it('discards an in-flight widget snapshot restore after downgrade', async () => {
  const fixture = fixtureRuntime('three-card-home', true);
  const storage = {
    getItem: async () => JSON.stringify({ version: 1, cards: fixture.cards, mode: 'amber', recent: [],
      mockPlan: 'pro', pausedCards: [] }),
    setItem: async () => {},
  };
  const preferences = createPreferences(storage, fixture.catalogue, Date.now, undefined, [], undefined, undefined, { mockPlans: true });
  const stations = createStationOwner(fixture.transport, () => performance.now(), fixture.now);
  const panel = vi.mocked(savedPlatformWidget.updateSnapshot);
  type Entry = Awaited<ReturnType<typeof savedPlatformWidget.getTimeline>>[number];
  let restore!: (entries: Entry[]) => void;
  vi.mocked(savedPlatformWidget.getTimeline).mockImplementationOnce(() => new Promise(resolve => { restore = resolve; }));
  const stop = connectSavedPlatformWidgets({
    preferences, stations, catalogue: fixture.catalogue, discovery: createDiscovery(), now: fixture.now, synthetic: true,
  });
  try {
    await preferences.load();
    expect(savedPlatformWidget.getTimeline).toHaveBeenCalledOnce();
    preferences.setMockPlan('free');
    expect(panel.mock.lastCall?.[0]).toEqual({ mockPlan: 'free', pages: [] });
    const selection = fixture.cards[0];
    restore([{ date: new Date(), props: { mockPlan: 'pro', pages: [{
      key: selectionKey(selection), selection, relevantFeeds: [],
      board: { station: 'Pro cached station', rows: [] },
    }] } }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.mock.calls.map(([config]) => config.mockPlan)).toEqual(['free']);
  } finally {
    stop();
    stations.dispose();
  }
});
