import { RequestFailure, decodeSnapshot, type StationTransport } from './api';
import { createCatalogue, readSelection } from './catalogue';
import manifest from '../assets/manifest.json';
import camden from '../assets/camden-mixed.json';
import colindale from '../assets/colindale-mixed.json';
import emptyCamden from '../assets/camden-selected-empty.json';

const seedCards = manifest.homeSelections.flatMap(value => readSelection(value) ?? []);
const extra = { stationId: colindale.station.id, platform: 'B', direction: 'Southbound' };
const clock = Date.parse(manifest.frozenNow);
const growthInitialRows = new Map([
  [colindale.station.id + ':A', 1],
  [camden.station.id + ':A', 2],
  [camden.station.id + ':B', 3],
]);

/** Provides an isolated replay for the two documented synthetic station paths. */
export function fixtureRuntime(scenario: string, seed: boolean) {
  // Development-only synthetic typography specimens, isolated from live transport and saved cards.
  const readability = scenario === 'glyph-readability';
  const longStation = { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' as const };
  const cards = readability ? [longStation, ...seedCards.slice(1)] : seedCards;
  const catalogue = createCatalogue({ version: 1, platforms: [...cards, extra] });
  const bodies = new Map([
    [camden.station.id, scenario === 'empty-camden-a' ? emptyCamden : camden],
    [colindale.station.id, colindale],
  ]);
  if (readability) bodies.set('940GZZLUKSX', { ...camden,
    station: { ...camden.station, id: '940GZZLUKSX', name: "King's Cross St. Pancras" },
  });
  let camdenRequests = 0;
  const growthRequests = new Map<string, number>();
  const transport: StationTransport = async id => {
    const response = bodies.get(id);
    if (!response) throw new RequestFailure('unavailable');
    if (id === camden.station.id) {
      camdenRequests += 1;
      if (camdenRequests === 2 && scenario === 'camden-outage') throw new RequestFailure('unavailable');
      if (camdenRequests === 2 && scenario === 'camden-rate-limited') throw new RequestFailure('limited');
    }
    if (readability) {
      const destinations = ['Morden via Bank', 'Kennington via Charing Cross',
        'Hammersmith (Hammersmith & City)', "King’s Cross/St. Pancras", 'Supercalifragilisticexpialidocious'];
      return decodeSnapshot({ ...response, platforms: response.platforms.map(platform => ({
        ...platform, departures: platform.departures.map((departure, index) => ({ ...departure,
          destinationName: destinations[index % destinations.length], towards: null,
        })),
      })) }, id);
    }
    if (scenario === 'board-growth') {
      const request = (growthRequests.get(id) ?? 0) + 1;
      growthRequests.set(id, request);
      return decodeSnapshot({ ...response, platforms: response.platforms.map(platform => ({
        ...platform,
        departures: platform.departures.slice(0, request === 1
          ? growthInitialRows.get(id + ':' + platform.platform) : undefined).map(departure => ({ ...departure,
          towards: 'Morden via Charing Cross and Kennington',
        })),
      })) }, id);
    }
    return decodeSnapshot(response, id);
  };
  return { catalogue, transport, now: () => clock, cards: seed ? cards : [], synthetic: true };
}
