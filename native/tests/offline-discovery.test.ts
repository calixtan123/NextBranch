/** Exercises the native offline search, picker and details without network or native views. */
import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as shared from '../../src/lib/catalogue';
import sourceSnapshot from '../../data/tfl-station-platform-inventory/tfl-station-platform-lines.json';
import { createCatalogue, createCanonicalCatalogue } from '../src/catalogue';
import { createDiscovery, reviewedSelection } from '../src/discovery';
import { createPreferences } from '../src/preferences';
import { serviceCapability } from '../../src/lib/catalogue/capability';
import { LineLabels } from '../src/LineLabels';
import { SearchScreen, PickerScreen, PlatformDetailsScreen } from '../src/SearchScreens';
import { HomeScreen, DeparturesScreen } from '../src/LiveScreens';
import type { Screen } from '../src/navigation';

const hooks = vi.hoisted(() => ({ runtime: vi.fn(), preferences: vi.fn(), query: '', setQuery: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [hooks.query, hooks.setQuery] }));
vi.mock('react-native', () => ({ View: 'View', TextInput: 'TextInput', Keyboard: { dismiss: vi.fn() }, AccessibilityInfo: { announceForAccessibility: vi.fn() } }));
vi.mock('../src/screen-context', () => ({ Surface: 'Surface', TextAction: 'TextAction', useRuntime: hooks.runtime, usePreferences: hooks.preferences, useBoardTime: () => 0, useRefresh: () => ({ refresh: vi.fn(), refreshing: false }) }));
vi.mock('../src/GlassControls', () => ({ GlassSurface: 'GlassSurface', GlassAction: 'GlassAction' }));
vi.mock('../src/PlatformBoard', () => ({ PlatformBoard: 'PlatformBoard', platformName: (selection: { platform: string }) => 'Platform ' + selection.platform }));
vi.mock('../src/theme', () => ({ Action: 'Action', Icon: 'Icon', IconButton: 'IconButton', Label: 'Label', Result: 'Result', ui: {}, usePalette: () => ({}) }));

/** Traverses the actual screen element tree at mocked native boundaries. */
function nodes(node: ReactNode): ReactElement<Record<string, any>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child) ? [child, ...nodes(child.props.children)] : []);
}
/** Reads visible screen text, including Result titles and details. */
function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<Record<string, any>>(child)
    ? [child.props.title, child.props.detail, text(child.props.children)].filter(Boolean).join(' ')
    : String(child)).join(' ');
}
const discovery = () => createDiscovery(() => shared);
const reviewed = createCatalogue({ version: 1, platforms: [
  { stationId: '940GZZLUCTN', platform: '1', direction: 'Northbound' },
] });
const navigation = () => ({ goBack: vi.fn(), navigate: vi.fn() });
const picker = (stationId: string, nav = navigation()) => PickerScreen({ navigation: nav, route: { params: { stationId } } } as unknown as Screen<'Picker'>);
/** Locates a physical row by stable identity instead of its changing display copy. */
const platformRow = (tree: ReactNode, platformId: string) => nodes(tree).find(node => node.type === 'Result' && node.key?.endsWith(platformId))!;
const details = (stationId: string, platformId: string) => PlatformDetailsScreen({ navigation: navigation(), route: { params: { stationId, platformId } } } as unknown as Screen<'PlatformDetails'>);

beforeEach(() => {
  hooks.query = '';
  hooks.runtime.mockReturnValue({ discovery: discovery(), catalogue: createCanonicalCatalogue(shared.catalogue), synthetic: false, preferences: { selectStation: vi.fn() } });
  hooks.preferences.mockReturnValue({ recent: [], mode: 'amber', cards: [] });
});

it('loads the validated full catalogue offline and recovers a missing or invalid bundle', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect(discovery().catalogue?.counts.app).toEqual({ stations: 460, platforms: 1235, services: 1528 });
  for (const load of [() => { throw new Error('missing bundle'); }, () => { throw new Error('invalid snapshot'); }]) {
    const missing = createDiscovery(load);
    expect(missing.catalogue).toBeNull();
    expect(missing.search('Kew')).toEqual({ state: 'missing-catalogue', stations: [] });
  }
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});

it('searches outside Northern, aliases and punctuation deterministically through the search screen', () => {
  hooks.query = 'kEW-Gardens';
  const nav = navigation();
  const tree = SearchScreen({ navigation: nav } as unknown as Screen<'Search'>);
  const result = nodes(tree).find(node => node.props.title === 'Kew Gardens')!;
  expect(nodes(result).find(node => node.type === LineLabels)?.props.lines).toEqual([{ id: 'district', name: 'District' }, { id: 'mildmay', name: 'Mildmay' }]);
  result.props.onPress();
  expect(hooks.runtime().preferences.selectStation).toHaveBeenCalledWith('HUBKWG');
  expect(nav.navigate).toHaveBeenCalledWith('Picker', { stationId: 'HUBKWG' });
  expect(discovery().search('Kings Cross').stations[0].station_name).toContain("King's Cross");
  expect(discovery().search('st').stations).toEqual(discovery().search('ST').stations);
});

it('shows empty, no-match, missing-catalogue and canonical recent names through search', () => {
  const render = () => SearchScreen({ navigation: navigation() } as unknown as Screen<'Search'>);
  expect(text(render())).toContain('Your two most recent searches');
  hooks.preferences.mockReturnValue({ recent: ['HUBKWG'], mode: 'amber', cards: [] });
  expect(text(render())).toContain('Kew Gardens');
  hooks.query = 'xyz no station';
  expect(text(render())).toContain('No stations found');
  hooks.runtime.mockReturnValue({ ...hooks.runtime(), discovery: createDiscovery(() => { throw Error('missing'); }) });
  expect(text(render())).toContain('Station catalogue is unavailable');
});

it('offers a TfL platform from empty Home', () => {
  hooks.runtime.mockReturnValue({ ...hooks.runtime(), stations: { isOnline: () => true, isRateLimited: () => false } });
  expect(text(HomeScreen({ navigation: navigation() } as unknown as Screen<'Home'>))).toContain('Add a TfL platform');
});

it('persists non-Northern canonical recents and restores their names without altering saved selections', async () => {
  let raw: string | null = null;
  const storage = { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } };
  const known = (id: string) => shared.catalogue.stationsByAnyId.has(id);
  const owner = createPreferences(storage, reviewed, Date.now, 'test', [], known);
  await owner.load();
  owner.selectStation('HUBKWG');
  owner.selectStation('940GZZDLABR');
  owner.selectStation('missing');
  await owner.flush();
  const restored = createPreferences(storage, reviewed, Date.now, 'test', [], known);
  await restored.load();
  expect(restored.get().recent).toEqual(['940GZZDLABR', 'HUBKWG']);
  expect(restored.get().cards).toEqual([]);
  hooks.preferences.mockReturnValue(restored.get());
  expect(text(SearchScreen({ navigation: navigation() } as unknown as Screen<'Search'>))).toContain('Abbey Road');
});

it('lists Kew Gardens shared platforms once and opens canonical browse details with every service', () => {
  const nav = navigation();
  const tree = picker('HUBKWG', nav);
  const rows = nodes(tree).filter(node => node.type === 'Result');
  expect(rows).toHaveLength(2);
  expect(text(tree)).toContain('Eastbound');
  expect(text(tree)).toContain('Westbound');
  expect(text(tree)).toContain("District · Towards Earl's Court");
  expect(text(tree)).toContain('Mildmay · Towards Stratford');
  rows[0].props.onPress();
  const [route, params] = nav.navigate.mock.lastCall!;
  expect(route).toBe('Departures');
  expect(params.selection.stationId).toBe('HUBKWG');
  expect(params.selection.physicalPlatformId).toBe(shared.catalogue.stationsById.get('HUBKWG')!.platforms[0].platform_id);
});

it('retains tram blank numbers and unknown fields and excludes National Rail-only platforms in native flow', () => {
  const tree = picker('HUBECY');
  const rows = nodes(tree).filter(node => node.type === 'Result');
  expect(rows).toHaveLength(2);
  expect(text(tree)).not.toMatch(/Platform [0-9]/);
  expect(text(tree)).toContain('Platform number not published');
  expect(text(tree)).not.toContain('Towards not published');
  expect(rows.every(row => row.props.detail === '')).toBe(true);
  const tram = shared.catalogue.stationsById.get('HUBECY')!.platforms[0];
  expect(text(details('HUBECY', tram.platform_id))).toContain('Towards not published');
  const unknown = shared.catalogue.stations.find(station => station.platforms.some(platform => !platform.cardinal_direction))!;
  expect(text(picker(unknown.station_id))).toContain('Direction not published');
  const unknownPlatform = unknown.platforms.find(platform => !platform.cardinal_direction)!;
  expect(text(details(unknown.station_id, unknownPlatform.platform_id))).toContain('Direction unavailable');
  expect(text(details('HUBKWG', tram.platform_id))).toContain('Platform information is unavailable');
  expect(text(picker('missing'))).toContain('Platform information is unavailable');
});

it('keeps reviewed Northern navigation and synthetic fixture platforms working', () => {
  const station = shared.catalogue.stationsByAnyId.get('940GZZLUCTN')!;
  const first = station.platforms[0];
  expect(reviewedSelection(station, first, reviewed)).toEqual({ stationId: '940GZZLUCTN', platform: '1', direction: 'Northbound' });
  expect(reviewedSelection(station, station.platforms[1], reviewed)).toBeNull();
  const nav = navigation();
  const tree = picker(station.station_id, nav);
  platformRow(tree, first.platform_id).props.onPress();
  expect(nav.navigate).toHaveBeenCalledWith('Departures', { selection: { stationId: station.station_id, physicalPlatformId: first.platform_id, platform: '1', direction: 'Northbound' } });
  const fixture = createCatalogue({ version: 1, platforms: [{ stationId: station.station_id, platform: 'A', direction: 'Southbound' }] });
  hooks.runtime.mockReturnValue({ ...hooks.runtime(), catalogue: fixture, synthetic: true });
  const synthetic = picker(station.station_id, nav);
  expect(text(synthetic)).toContain('Platform A');
  expect(text(synthetic)).not.toContain('Platform 1');
  expect(text(synthetic)).not.toContain('Towards not published');
  expect(nodes(synthetic).find(node => node.props.title === 'Southbound Platform A')!.props.detail).toBe('');
  nodes(synthetic).find(node => node.props.title === 'Southbound Platform A')!.props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('Departures', { selection: { stationId: station.station_id, platform: 'A', direction: 'Southbound' } });
});

it('loads and searches the shared catalogue when native lacks toSorted, retaining source order', () => {
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 'toSorted');
  const sourceOrder = shared.catalogue.stations.slice();
  Object.defineProperty(Array.prototype, 'toSorted', { configurable: true, writable: true, value: undefined });
  try {
    expect(discovery().search('Kew').stations[0].station_name).toBe('Kew Gardens');
    expect(shared.createCatalogue({ ...sourceSnapshot }).counts.app.stations).toBe(460);
    expect(shared.catalogue.stations).toEqual(sourceOrder);
  } finally {
    if (original) Object.defineProperty(Array.prototype, 'toSorted', original);
    else Reflect.deleteProperty(Array.prototype, 'toSorted');
  }
});

it.each([
  { recent: ['940GZZLUKSX', 'HUBKWG'] },
  { recent: ['940GZZLUKSX', 'HUBKGX', 'HUBKWG'] },
])('deduplicates pre-upgrade recent station identities before applying the history limit ($recent)', async ({ recent }) => {
  let raw = JSON.stringify({ version: 1, cards: [], recent });
  const storage = { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } };
  const known = (id: string) => shared.catalogue.stationsByAnyId.has(id);
  const canonical = (id: string) => shared.catalogue.stationsByAnyId.get(id)?.station_id ?? id;
  const owner = createPreferences(storage, reviewed, Date.now, 'test', [], known, canonical);
  await owner.load();
  expect(owner.get().recent).toEqual(['HUBKGX', 'HUBKWG']);
  owner.selectStation('HUBKGX');
  await owner.flush();
  const restored = createPreferences(storage, reviewed, Date.now, 'test', [], known, canonical);
  await restored.load();
  expect(restored.get().recent).toEqual(['HUBKGX', 'HUBKWG']);
  hooks.preferences.mockReturnValue(restored.get());
  const rows = nodes(SearchScreen({ navigation: navigation() } as unknown as Screen<'Search'>)).filter(node => node.type === 'Result');
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map(row => row.key)).size).toBe(2);
  expect(rows.map(row => row.props.title)).toEqual(["King's Cross St Pancras", 'Kew Gardens']);
  owner.selectStation('HUBKWG');
  owner.selectStation('940GZZLUKSX');
  await owner.flush();
  expect(JSON.parse(raw).recent).toEqual(['HUBKGX', 'HUBKWG']);
});

it('retains recoverable recent IDs when canonical discovery is unavailable', async () => {
  const recent = ['940GZZLUKSX', 'HUBKWG'];
  const owner = createPreferences({ getItem: async () => JSON.stringify({ version: 1, recent }), setItem: async () => undefined },
    reviewed, Date.now, 'test', [], id => Boolean(id.trim()));
  await owner.load();
  expect(owner.get().recent).toEqual(recent);
});


const verifiedWalkthroughs = [
  { line: 'bakerloo', stationId: '940GZZLUBST', platformNumber: '8' },
  { line: 'central', stationId: 'HUBBAN', platformNumber: '5' },
  { line: 'circle', stationId: '940GZZLUALD', platformNumber: '1' },
  { line: 'district', stationId: '940GZZLUACT', platformNumber: '1' },
  { line: 'hammersmith-city', stationId: '940GZZLUADE', platformNumber: '1' },
  { line: 'jubilee', stationId: '940GZZLUBST', platformNumber: '7' },
  { line: 'metropolitan', stationId: '940GZZLUALD', platformNumber: '2' },
  { line: 'northern', stationId: '940GZZLUCND', platformNumber: '1' },
  { line: 'piccadilly', stationId: '940GZZLUACT', platformNumber: '1' },
  { line: 'victoria', stationId: 'HUBBHO', platformNumber: '1' },
  { line: 'waterloo-city', stationId: 'HUBBAN', platformNumber: '7' },
  { line: 'liberty', stationId: 'HUBUPM', platformNumber: '6' },
  { line: 'lioness', stationId: 'HUBEUS', platformNumber: '9' },
  { line: 'district', stationId: 'HUBKWG', platformNumber: '1' },
  { line: 'mildmay', stationId: 'HUBKWG', platformNumber: '1' },
  { line: 'mildmay', stationId: 'HUBKWG', platformNumber: '2' },
  { line: 'suffragette', stationId: '910GCROUCHH', platformNumber: '1' },
  { line: 'weaver', stationId: 'HUBLST', platformNumber: '6' },
  { line: 'windrush', stationId: '910GANERLEY', platformNumber: '1' },
  { line: 'windrush', stationId: 'HUBNWX', platformNumber: 'D' },
  { line: 'tram', stationId: '940GZZCRADD', platformNumber: '' },
  { line: 'tram', stationId: '940GZZCRCTR', platformNumber: '' },
  { line: 'elizabeth', stationId: 'HUBPAD', platformNumber: 'A' },
  { line: 'elizabeth', stationId: 'HUBEAL', platformNumber: '3' },
  { line: 'elizabeth', stationId: '910GRDNGSTN', platformNumber: '14' },
  { line: 'elizabeth', stationId: 'HUBABW', platformNumber: '4' },
  { line: 'dlr', stationId: 'HUBCAW', platformNumber: '3' },
  { line: 'dlr', stationId: 'HUBCAW', platformNumber: '4' },
  { line: 'dlr', stationId: 'HUBSRA', platformNumber: '4A' },
  { line: 'dlr', stationId: 'HUBSRA', platformNumber: '4B' },
].flatMap(example => ['outage', 'empty', 'available'].map(condition => ({ ...example, condition })));

it.each(verifiedWalkthroughs)('searches, saves, restores and reopens $line during $condition', async ({ line, stationId, platformNumber, condition }) => {
  const catalog = createCanonicalCatalogue(shared.catalogue);
  const station = shared.catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(candidate => candidate.platform_number === platformNumber && candidate.services.some(service => service.line_id === line))!;
  const service = platform.services.find(candidate => candidate.line_id === line)!;
  expect(serviceCapability(station, platform, service)).toMatchObject({ feed: 'supported', mapping: 'supported' });
  let raw: string | null = null;
  const storage = { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } };
  const preferences = createPreferences(storage, catalog, Date.now, 'test', [], id => shared.catalogue.stationsByAnyId.has(id));
  await preferences.load();
  const snapshot = condition !== 'outage' ? { station: { id: stationId, name: station.station_name }, observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: condition === 'available' ? [{ physicalPlatformId: platform.platform_id, platform: platform.platform_number, direction: null, departures: [{ id: 'native-train', lineId: line, destinationName: '', towards: '', expectedArrival: '2026-01-01T00:01:00Z', secondsToStation: 60 }] }] : [] } : undefined;
  if (snapshot) {
    const { decodeSnapshot } = await import('../src/api');
    const { boardRows } = await import('../src/board-model');
    const decoded = decodeSnapshot(snapshot, stationId);
    const rows = boardRows(decoded, catalog.selection(station, platform)!, Date.parse(snapshot.observedAt), 5);
    expect(rows.map(row => row.lineId)).toEqual(condition === 'available' ? [line] : []);
  }
  const stations = { get: () => ({ pending: false, error: condition === 'outage' ? 'unavailable' : null, snapshot }), isOnline: () => true, isRateLimited: () => false };
  hooks.runtime.mockReturnValue({ discovery: discovery(), catalogue: catalog, synthetic: false, preferences, stations });
  hooks.preferences.mockImplementation(() => preferences.get());
  const nav = { ...navigation(), popToTop: vi.fn() };
  hooks.query = station.station_name;
  nodes(SearchScreen({ navigation: nav } as unknown as Screen<'Search'>)).find(node => node.props.title === station.station_name)!.props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('Picker', { stationId });
  platformRow(picker(stationId, nav), platform.platform_id).props.onPress();
  const [route, params] = nav.navigate.mock.lastCall!;
  expect(route).toBe('Departures');
  expect(params.selection).toMatchObject({ stationId, physicalPlatformId: platform.platform_id, direction: platform.cardinal_direction });
  const board = DeparturesScreen({ navigation: nav, route: { params } } as unknown as Screen<'Departures'>);
  nodes(board).find(node => node.props.children === 'Save platform')!.props.onPress();
  await preferences.flush();
  const restored = createPreferences(storage, catalog); await restored.load();
  hooks.runtime.mockReturnValue({ ...hooks.runtime(), preferences: restored });
  hooks.preferences.mockImplementation(() => restored.get());
  const home = HomeScreen({ navigation: nav } as unknown as Screen<'Home'>);
  const card = nodes(home).find(node => node.type === 'PlatformBoard')!;
  expect(card.props.selection).toEqual(params.selection);
  card.props.onOpen();
  expect(nav.navigate).toHaveBeenLastCalledWith('Departures', params);
});

it.each([['HUBLEW', '5'], ['HUBTOG', '1']])('keeps uncaptured DLR %s platform %s inspectable with matching explanation and no Save', async (stationId, number) => {
  const station = shared.catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number)!;
  const catalog = createCanonicalCatalogue(shared.catalogue);
  const nav = navigation();
  expect(catalog.selection(station, platform)).toBeNull();
  platformRow(picker(stationId, nav), platform.platform_id).props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('PlatformDetails', { stationId, platformId: platform.platform_id });
  const tree = details(stationId, platform.platform_id);
  expect(text(tree)).toContain('DLR: Platform matching awaits verification');
  expect(nodes(tree).some(node => node.props.children === 'Save platform')).toBe(false);
});


it.each([['910GEMRSPKH', '1'], ['HUBBSH', '1'], ['HUBWFJ', '1'], ['HUBBKG', '7']])('keeps unverified Overground %s/%s inspectable with every published service and no Save', (stationId, number) => {
  const station = shared.catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number)!;
  const catalog = createCanonicalCatalogue(shared.catalogue);
  expect(catalog.selection(station, platform)).toBeNull();
  const nav = navigation();
  platformRow(picker(stationId, nav), platform.platform_id).props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('PlatformDetails', { stationId, platformId: platform.platform_id });
  const tree = details(stationId, platform.platform_id);
  expect(text(tree)).toContain('Platform matching awaits verification');
  for (const service of platform.services) expect(text(tree)).toContain(service.line_name);
  expect(nodes(tree).some(node => node.props.children === 'Save platform')).toBe(false);
});


it.each([['HUBPAD', '1'], ['HUBLST', '15'], ['HUBEAL', '1'], ['HUBHX5', '3']])('keeps unverified Elizabeth %s/%s inspectable without Save', (stationId, number) => {
  const station = shared.catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number && p.services.some(s => s.line_id === 'elizabeth'))!;
  const catalog = createCanonicalCatalogue(shared.catalogue);
  const nav = navigation();
  expect(catalog.selection(station, platform)).toBeNull();
  platformRow(picker(stationId, nav), platform.platform_id).props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('PlatformDetails', { stationId, platformId: platform.platform_id });
  const tree = details(stationId, platform.platform_id);
  expect(text(tree)).toContain('Elizabeth line: Platform matching awaits verification');
  expect(text(tree)).toContain('National Rail');
  expect(nodes(tree).some(node => node.props.children === 'Save platform')).toBe(false);
});


it.each(['HUBECY', 'HUBELM', 'HUBBEK', '940GZZALGWP', '940GZZALRDK'])('keeps unverified Tram or cable-car %s searchable and browse-only with source labels', stationId => {
  const station = shared.catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.services.some(s => ['tram', 'london-cable-car'].includes(s.line_id)))!;
  const catalog = createCanonicalCatalogue(shared.catalogue);
  expect(catalog.selection(station, platform)).toBeNull();
  const nav = navigation();
  hooks.query = station.station_name;
  nodes(SearchScreen({ navigation: nav } as unknown as Screen<'Search'>)).find(node => node.props.title === station.station_name)!.props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('Picker', { stationId });
  const tree = picker(stationId, nav);
  const title = platform.platform_number ? 'Platform ' + platform.platform_number : 'Platform number not published';
  platformRow(tree, platform.platform_id).props.onPress();
  expect(nav.navigate).toHaveBeenLastCalledWith('PlatformDetails', { stationId, platformId: platform.platform_id });
  const detailTree = details(stationId, platform.platform_id);
  expect(text(detailTree)).toContain(title);
  expect(text(detailTree)).toContain(platform.cardinal_direction || 'Direction unavailable');
  expect(text(detailTree)).toContain(stationId.startsWith('940GZZAL') ? 'Live feed and platform matching await verification' : 'Platform matching awaits verification');
  expect(nodes(detailTree).some(node => node.props.children === 'Save platform')).toBe(false);
});


it('renders Northern, Central and Elizabeth headings at TCR with complete explicit-direction rows', () => {
  const station = shared.catalogue.stations.find(item => item.station_name === 'Tottenham Court Road')!;
  const tree = picker(station.station_id);
  const headings = nodes(tree).filter(node => node.type === LineLabels && node.props.heading);
  expect(headings.map(node => node.props.lines.map((line: { id: string }) => line.id))).toEqual([['northern'], ['central'], ['elizabeth']]);
  const rows = nodes(tree).filter(node => node.type === 'Result');
  expect(rows).toHaveLength(station.platforms.length);
  for (const platform of station.platforms) {
    const row = rows.find(node => node.key?.endsWith(platform.platform_id))!;
    expect(row).toBeDefined();
    expect(row.props.title).toBe(`${platform.cardinal_direction} Platform ${platform.platform_number}`);
    expect(row.props.titleEmphasis).toBe(true);
    expect(row.props.detail).not.toContain(platform.cardinal_direction || 'Direction not published');
    expect(row.props.detail).not.toContain(platform.friendly_name);
    expect(row.props.detail).toBe(platform.services[0].direction_towards ? 'Towards ' + platform.services[0].direction_towards : '');
  }
});

it('renders one shared heading at Kew and published-service markers in browse details', () => {
  const tree = picker('HUBKWG');
  const headings = nodes(tree).filter(node => node.type === LineLabels && node.props.heading);
  expect(headings).toHaveLength(1);
  expect(headings[0].props.lines).toEqual([{ id: 'district', name: 'District' }, { id: 'mildmay', name: 'Mildmay' }]);
  const platform = shared.catalogue.stationsById.get('HUBKWG')!.platforms[0];
  expect(nodes(details('HUBKWG', platform.platform_id)).find(node => node.type === LineLabels)?.props.lines).toEqual(headings[0].props.lines);
});


it('renders Camden Town northbound heading and destination once while retaining published details', () => {
  const station = shared.catalogue.stationsByAnyId.get('940GZZLUCTN')!;
  const platform = station.platforms.find(item => item.platform_number === '1')!;
  const row = platformRow(picker(station.station_id), platform.platform_id);
  expect(row.props.title).toBe('Northbound Platform 1');
  expect(row.props.detail).toBe('Towards Edgware');
  expect(row.props.titleEmphasis).toBe(true);
  expect(text(details(station.station_id, platform.platform_id))).toContain(platform.friendly_name);
});
