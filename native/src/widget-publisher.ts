/** Shares saved platforms and existing foreground departures with the iOS widget. */
import { serviceCapability } from '../../src/lib/catalogue/capability';
import { byId } from '../../src/lib/northern/stations';
import type { Snapshot } from './api';
import { selectionKey } from './catalogue';
import type { createRuntime } from './runtime';
import { effectiveStyle } from './preferences';
import { savedPlatformWidget } from './SavedPlatformWidget';
import { widgetBoard, type WidgetConfiguration } from './widget-timeline';

/** Publishes the current order, appearance and cached boards in one snapshot. */
export function connectSavedPlatformWidgets({
  preferences, catalogue, discovery, stations, now, synthetic,
}: ReturnType<typeof createRuntime>) {
  let published: string | undefined;
  let previousTiming: Array<Snapshot['timing']> = [];
  const apiOrigin = synthetic ? undefined : process.env.EXPO_PUBLIC_NEXTBRANCH_API_URL;
  const publish = () => {
    const { ready, cards, mode, interfaceTheme } = preferences.get();
    if (!ready || !stations.isActive()) return;
    const observationNow = now();
    const wallNow = Date.now();
    const online = stations.isOnline();
    const limited = stations.isRateLimited();
    const config: WidgetConfiguration = {
      ...(apiOrigin ? { apiOrigin } : {}),
      pages: cards.map(selection => {
        const state = stations.get(selection.stationId);
        const station = discovery.catalogue?.stationsByAnyId.get(selection.stationId);
        const platform = station?.platforms.find(platform => platform.platform_id === selection.physicalPlatformId);
        const services = platform?.services.map(({ line_id, line_name }) => ({ line_id, line_name }));
        const relevantFeeds = station && platform ? platform.services
          .filter(service => serviceCapability(station, platform, service).feed === 'supported')
          .map(service => ({ lineId: service.line_id, stopAreaId: service.stop_area_naptan_code })) : [];
        const board = widgetBoard({ selection, catalogue, state, online, limited, observationNow, wallNow,
          stationName: station?.station_name ?? state.snapshot?.station.name ?? byId.get(selection.stationId)?.name ?? selection.stationId,
          style: effectiveStyle(mode, selection), interfaceTheme, services, relevantFeeds });
        return { key: selectionKey(selection), selection, board, relevantFeeds, ...(services ? { services } : {}),
          ...(!catalogue.has(selection) ? { review: true } : {}) };
      }),
    };
    // Wall and elapsed clock sampling can differ by milliseconds between notifications.
    // A new station timing anchor identifies an actual refresh, including in fixtures.
    const timing = config.pages.map(({ board, selection }) => board.expiresAt === undefined ? undefined :
      stations.get(selection.stationId).snapshot?.timing);
    const signature = JSON.stringify(config.pages.map(({ board, ...page }) => {
      const { expiresAt, rows, ...summary } = board;
      return [page, summary, rows.map(({ expiresAt, ...row }) => row)];
    }));
    if (signature === published && timing.every((anchor, index) => anchor === previousTiming[index])) return;
    try {
      savedPlatformWidget.updateSnapshot(config);
      published = signature;
      previousTiming = timing;
    } catch (error) {
      console.warn('Could not update the saved-platform widget', error);
    }
  };
  const stopPreferences = preferences.subscribe(publish);
  const stopStations = stations.subscribe(publish);
  publish();
  return () => {
    stopPreferences();
    stopStations();
  };
}
