import AsyncStorage from '@react-native-async-storage/async-storage';
import reviewedCatalogue from '../assets/platform-catalogue.json';
import { httpTransport, RequestFailure, type StationTransport } from './api';
import { createCatalogue } from './catalogue';
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
  const catalogue = fixture?.catalogue ?? createCatalogue(reviewedCatalogue);
  const discovery = createDiscovery();
  const now = fixture?.now ?? Date.now;
  return {
    now,
    catalogue,
    discovery,
    synthetic: Boolean(fixture),
    preferences: createPreferences(AsyncStorage, catalogue, Date.now,
      fixture ? 'nextbranch.fixture.preferences' : 'nextbranch.preferences', fixture?.cards,
      id => discovery.catalogue ? discovery.catalogue.stationsByAnyId.has(id) : Boolean(id.trim()),
      id => fixture ? id : discovery.catalogue?.stationsByAnyId.get(id)?.station_id ?? id),
    stations: createStationOwner(fixture?.transport ?? liveTransport(), Date.now, now),
  };
}
