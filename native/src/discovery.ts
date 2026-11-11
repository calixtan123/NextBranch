/** Adapts the shared validated offline catalogue to native discovery and reviewed boards. */
import type { AppStation, Catalogue as SharedCatalogue, searchCatalogue } from '../../src/lib/catalogue';
import type { CataloguePlatform } from '../../src/lib/catalogue/schema';
import { readSelection, type Catalogue, type Selection } from './catalogue';

type SharedModule = { catalogue: SharedCatalogue; searchCatalogue: typeof searchCatalogue };

/**
 * Loads the shared validated bundle inside a recovery boundary.
 *
 * Parameters
 * ----------
 * load : function, optional
 *     Synchronous bundled-module loader. No network is used.
 *
 * Returns
 * -------
 * object
 *     Offline catalogue and search, including an explicit missing-catalogue state
 *     if loading or source validation fails.
 */
export function createDiscovery(load: () => SharedModule = () => require('../../src/lib/catalogue')) {
  let shared: SharedModule | null;
  try {
    shared = load();
  } catch {
    // A broken bundle must leave Home and existing saved-platform recovery usable.
    shared = null;
  }
  return {
    catalogue: shared?.catalogue ?? null,
    search(query: string): ReturnType<typeof searchCatalogue> {
      return shared ? shared.searchCatalogue(query, shared.catalogue) : { state: 'missing-catalogue', stations: [] };
    },
  };
}

/**
 * Resolves an existing reviewed Northern board without widening save capability.
 *
 * Parameters
 * ----------
 * station : AppStation
 *     Canonical station owning the physical platform.
 * platform : CataloguePlatform
 *     Published physical platform and service relationships.
 * reviewed : Catalogue
 *     Existing native reviewed tuple catalogue, including synthetic fixtures.
 *
 * Returns
 * -------
 * Selection or null
 *     A unique reviewed tuple, or null for a browse-only platform.
 */
export function reviewedSelection(station: AppStation, platform: CataloguePlatform, reviewed: Catalogue): Selection | null {
  const candidates = platform.services.filter(service => service.line_id === 'northern').flatMap(service => {
    const selection = readSelection({ stationId: service.stop_area_naptan_code,
      platform: platform.platform_number, direction: platform.cardinal_direction });
    return selection && reviewed.has(selection) ? [selection] : [];
  });
  const matching = station.platforms.filter(candidate => candidate.platform_number === platform.platform_number &&
    candidate.cardinal_direction === platform.cardinal_direction && candidate.services.some(service => service.line_id === 'northern'));
  return candidates.length === 1 && matching.length === 1 ? candidates[0] : null;
}
