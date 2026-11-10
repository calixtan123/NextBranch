import { RequestFailure, decodeSnapshot, type StationTransport } from './api';
import { createCatalogue, readSelection } from './catalogue';
import manifest from '../assets/manifest.json';
import camden from '../assets/camden-mixed.json';
import colindale from '../assets/colindale-mixed.json';
import emptyCamden from '../assets/camden-selected-empty.json';

const seedCards = manifest.homeSelections.flatMap(value => readSelection(value) ?? []);
const extra = { stationId: colindale.station.id, platform: 'B', direction: 'Southbound' };
const clock = Date.parse(manifest.frozenNow);

/** Provides an isolated replay for the two documented synthetic station paths. */
export function fixtureRuntime(scenario: string, seed: boolean) {
  const catalogue = createCatalogue({ version: 1, platforms: [...seedCards, extra] });
  const bodies = new Map([
    [camden.station.id, scenario === 'empty-camden-a' ? emptyCamden : camden],
    [colindale.station.id, colindale],
  ]);
  let camdenRequests = 0;
  const transport: StationTransport = async id => {
    const response = bodies.get(id);
    if (!response) throw new RequestFailure('unavailable');
    if (id === camden.station.id) {
      camdenRequests += 1;
      if (camdenRequests === 2 && scenario === 'camden-outage') throw new RequestFailure('unavailable');
      if (camdenRequests === 2 && scenario === 'camden-rate-limited') throw new RequestFailure('limited');
    }
    return decodeSnapshot(response, id);
  };
  return { catalogue, transport, now: () => clock, cards: seed ? seedCards : [], synthetic: true };
}
