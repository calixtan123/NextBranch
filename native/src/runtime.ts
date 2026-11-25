import AsyncStorage from '@react-native-async-storage/async-storage';
import reviewedCatalogue from '../assets/platform-catalogue.json';
import { httpTransport, RequestFailure, type StationTransport } from './api';
import { createCatalogue, createCanonicalCatalogue, type Catalogue } from './catalogue';
import { createDiscovery } from './discovery';
import { createPreferences } from './preferences';
import { createStationOwner } from './station-owner';

function liveTransport(): StationTransport {
  try {
    return httpTransport(process.env.EXPO_PUBLIC_NEXTBRANCH_API_URL, __DEV__);
  } catch {
    return async () => { throw new RequestFailure('configuration'); };
  }
}

/** Wires independent preference and station owners for one native app session. */
export function createRuntime() {
  const scenario = process.env.EXPO_PUBLIC_NEXTBRANCH_FIXTURE;
  const fixture = __DEV__ && scenario
    ? (require('./fixture') as typeof import('./fixture'))
      .fixtureRuntime(scenario, process.env.EXPO_PUBLIC_NEXTBRANCH_SEED === '1')
    : null;
  const mockPlans = !__DEV__ && process.env.EXPO_PUBLIC_NEXTBRANCH_TESTFLIGHT_WIDGET === '1'
    && process.env.EXPO_PUBLIC_NEXTBRANCH_MOCK_PLANS === '1';
  const discovery = createDiscovery();
  const catalogue: Catalogue = fixture?.catalogue ?? (discovery.catalogue ? createCanonicalCatalogue(discovery.catalogue) : createCatalogue(reviewedCatalogue));
  const elapsed = () => performance.now();
  const now = fixture?.now ?? elapsed;
  const fixturePreferencesKey = scenario === 'board-growth' || scenario === 'glyph-readability' || scenario?.startsWith('status-')
    ? `nextbranch.fixture.${scenario}.preferences` : 'nextbranch.fixture.preferences';
  return {
    now,
    catalogue,
    discovery,
    synthetic: Boolean(fixture),
    preferences: createPreferences(AsyncStorage, catalogue, Date.now,
      fixture ? fixturePreferencesKey : 'nextbranch.preferences', fixture?.cards,
      id => discovery.catalogue ? discovery.catalogue.stationsByAnyId.has(id) : Boolean(id.trim()),
      id => fixture ? id : discovery.catalogue?.stationsByAnyId.get(id)?.station_id ?? id, { mockPlans }),
    // Fixture display time is frozen, but cooldowns and polling need elapsed time.
    stations: createStationOwner(fixture?.transport ?? liveTransport(), elapsed, now,
      id => fixture ? id : discovery.catalogue?.stationsByAnyId.get(id)?.station_id ?? id),
  };
}
