/** Central TfL identities and deterministic, catalogue-derived native presentation. */
import { lines, type CataloguePlatform, type CatalogueService } from '../../src/lib/catalogue/schema';

const colours: Partial<Record<keyof typeof lines, string>> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056', northern: '#000000',
  piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA', elizabeth: '#6950A1',
  dlr: '#00A4A7', tram: '#84B817', liberty: '#61686B', lioness: '#FAA61A', mildmay: '#0077AD',
  suffragette: '#18A95D', weaver: '#9B0058', windrush: '#EF7B10', 'london-cable-car': '#E21836',
};
const neutralColour = '#61686B';
export type LineLabel = { id: string; name: string };

/** Returns a pinned line colour, falling back safely for an unrecognised ID. */
export function lineColour(lineId: string): string {
  return Object.hasOwn(colours, lineId) ? colours[lineId as keyof typeof colours]! : neutralColour;
}

/** Gives Northern priority, then Underground alphabetically, Elizabeth and other modes. */
function lineRank(id: string): number {
  if (id === 'northern') return 0;
  if (lines[id as keyof typeof lines]?.[1] === 'tube') return 1;
  return id === 'elizabeth' ? 2 : 3;
}

/** Compares IDs independently of source service or platform order. */
function compareLines(a: string, b: string): number {
  return lineRank(a) - lineRank(b) || a.localeCompare(b, 'en-GB');
}

/** Deduplicates published labels by line identity while retaining unknown line names. */
export function lineLabels(services: readonly Pick<CatalogueService, 'line_id' | 'line_name'>[]): LineLabel[] {
  const names = new Map<string, string>();
  for (const service of services) {
    const previous = names.get(service.line_id);
    if (!previous || service.line_name.localeCompare(previous, 'en-GB') < 0) names.set(service.line_id, service.line_name);
  }
  return [...names].sort(([a], [b]) => compareLines(a, b)).map(([id, name]) => ({ id, name }));
}

/** A set of served TfL lines and its physical platforms in source order. */
export type PlatformLineGroup = { key: string; lines: LineLabel[]; platforms: CataloguePlatform[] };

/**
 * Groups eligible platforms by their exact TfL line-ID set without changing input.
 *
 * Parameters
 * ----------
 * platforms : readonly CataloguePlatform[]
 *     Published physical platforms; mixed National Rail details stay intact.
 *
 * Returns
 * -------
 * PlatformLineGroup[]
 *     Deterministically ordered groups, preserving source platform order within each.
 */
export function platformLineGroups(platforms: readonly CataloguePlatform[]): PlatformLineGroup[] {
  const groups = new Map<string, PlatformLineGroup>();
  for (const platform of platforms) {
    if (!platform.is_customer_facing) continue;
    const labels = lineLabels(platform.services.filter(service => service.line_id !== 'national-rail'));
    if (!labels.length) continue;
    const key = JSON.stringify(labels.map(line => line.id));
    const group = groups.get(key);
    if (group) group.platforms.push(platform);
    else groups.set(key, { key, lines: labels, platforms: [platform] });
  }
  return [...groups.values()].sort((a, b) => {
    for (let index = 0; index < Math.min(a.lines.length, b.lines.length); index++) {
      const difference = compareLines(a.lines[index].id, b.lines[index].id);
      if (difference) return difference;
    }
    return a.lines.length - b.lines.length;
  });
}


/**
 * Combines published picker identity fields, explicitly retaining missing values.
 *
 * Parameters
 * ----------
 * direction : string
 *     Published cardinal direction, or an empty string.
 * number : string
 *     Published platform number, or an empty string.
 *
 * Returns
 * -------
 * string
 *     Direction-first title without inferred information.
 */
export function platformPickerTitle(direction: string, number: string): string {
  const platform = number ? 'Platform ' + number : 'Platform number not published';
  return direction && number ? `${direction} ${platform}` : `${direction || 'Direction not published'} · ${platform}`;
}

/**
 * Summarises picker destinations without repeating shared TfL line headings.
 *
 * Parameters
 * ----------
 * services : readonly CatalogueService[]
 *     Published services; National Rail details remain explicitly labelled.
 *
 * Returns
 * -------
 * string
 *     A common destination only when every TfL service publishes it; otherwise,
 *     individually labelled published TfL destinations,
 *     followed by any published National Rail destinations. Unpublished values
 *     produce no subtext; source service records remain unchanged.
 */
export function platformPickerDestination(services: readonly CatalogueService[]): string {
  const allTflDestinationsPublished = services.every(service =>
    service.line_id === 'national-rail' || service.direction_towards.trim().length > 0);
  const unique = [...new Map(services.filter(service => service.direction_towards.trim())
    .map(service => [JSON.stringify([service.line_id, service.direction_towards]), service])).values()];
  const tfl = unique.filter(service => service.line_id !== 'national-rail');
  const rail = unique.filter(service => service.line_id === 'national-rail');
  const towards = (destination: string) => 'Towards ' + destination;
  const labelled = (service: CatalogueService) => `${service.line_name} · ${towards(service.direction_towards)}`;
  const destinations = new Set(tfl.map(service => service.direction_towards));
  const descriptions = allTflDestinationsPublished && destinations.size === 1
    ? [towards(tfl[0].direction_towards)] : tfl.map(labelled);
  return [...descriptions, ...rail.map(labelled)].join('\n');
}
