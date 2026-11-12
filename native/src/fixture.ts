import { RequestFailure, decodeSnapshot, type StationTransport } from './api';
import { createCatalogue, readSelection, type Selection } from './catalogue';
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
  const statusScenario = scenario.startsWith('status-');
  const longStation = { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' as const };
  const cards: Selection[] = readability ? [longStation, ...seedCards.slice(1)] : statusScenario
    ? seedCards.map(card => {
      const platform = card.platform === 'A' ? '2' : '4';
      return { ...card, platform, physicalPlatformId: `${card.stationId}-Plat0${platform}-SB-northern` };
    }) : seedCards;
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
      if (camdenRequests === 2 && (scenario === 'camden-outage' || scenario === 'status-recovery')) throw new RequestFailure('unavailable');
      if (camdenRequests === 2 && scenario === 'camden-rate-limited') throw new RequestFailure('limited');
    }
    if (statusScenario) {
      // Leave a capture window below the station owner's 20-second request deadline.
      if (scenario === 'status-loading') await new Promise(resolve => setTimeout(resolve, 15_000));
      const age = scenario === 'status-age' ? (id === colindale.station.id ? 30_000 : 30_001) : 0;
      const feeds = scenario === 'status-partial' ? [
        { lineId: 'northern', stopAreaId: id, liveState: id === camden.station.id ? 'unavailable' : 'available' },
        { lineId: 'district', stopAreaId: '940GZZLUACT', liveState: 'unavailable' },
      ] : [{ lineId: 'northern', stopAreaId: id, liveState: 'available' }];
      return decodeSnapshot({ ...response,
        observedAt: new Date(clock - age).toISOString(),
        // Prevent automatic polls from advancing the manual failure/recovery replay.
        refreshAfterSeconds: 3600,
        catalogue: { stationId: id, liveState: scenario === 'status-partial' ? 'partial' : 'available', platforms: [], feeds },
        platforms: response.platforms.map(group => {
          const platform = group.platform === 'A' ? '2' : group.platform === 'B' ? '4' : null;
          return { ...group, platform,
            physicalPlatformId: platform ? `${id}-Plat0${platform}-SB-northern` : null };
        }),
      }, id);
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
