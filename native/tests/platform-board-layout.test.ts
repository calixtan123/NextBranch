/** Protects platform identity and line-label layout at ordinary and accessibility text sizes. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { LineLabels } from '../src/LineLabels';
import { PlatformBoard } from '../src/PlatformBoard';
import { Label } from '../src/theme';
import type { Snapshot } from '../src/api';

const boundary = vi.hoisted(() => ({ fontScale: 1, light: false }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: boundary.fontScale }),
}));
vi.mock('../src/theme', async importOriginal => {
  const theme = await importOriginal<typeof import('../src/theme')>();
  return { ...theme, usePalette: () => theme.paletteFor(boundary.light) };
});

vi.mock('react-native-svg', () => ({
  default: 'Svg', Circle: 'Circle', Defs: 'Defs', FeGaussianBlur: 'FeGaussianBlur', Filter: 'Filter',
  Path: 'Path', Pattern: 'Pattern', Rect: 'Rect',
}));

type Element = ReactElement<{ children?: ReactNode; style?: unknown }>;

/** Walks the component's element output without mounting native views. */
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Element['props']>(child)) return [];
    return [child, ...elements(child.props.children)];
  });
}

/** Flattens conditional style arrays in the order React Native applies them. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style && typeof style === 'object' ? style as Record<string, unknown> : {};
}

/** Finds the header through its station identity, independently of board content. */
function headerFor(fontScale: number, expanded: boolean) {
  boundary.fontScale = fontScale;
  const tree = PlatformBoard({
    selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
    style: 'amber', state: { error: null, pending: true }, now: 0, online: true, limited: false,
    expanded, onOpen: expanded ? undefined : vi.fn(), onRetry: vi.fn(), onReview: vi.fn(),
  });
  expect(flattenStyle(tree.props.style).marginBottom).toBe(expanded ? 10 : 18);
  const header = elements(tree).find(node => node.type === View && Children.toArray(node.props.children).some(child =>
    isValidElement<Element['props']>(child) && child.type === View &&
    Children.toArray(child.props.children).some(label => isValidElement<Element['props']>(label) &&
      label.type === Label && label.props.children === "King's Cross St. Pancras")));
  expect(header, 'the board exposes its station header').toBeDefined();
  const [identity, line] = Children.toArray(header!.props.children) as Element[];
  const lineLabel = elements(line.props.children).find(node => node.type === LineLabels);
  expect(lineLabel, 'the header exposes its line label').toBeDefined();
  return { header: header!, identity, line, lineLabel: lineLabel! };
}

describe.each([
  { screen: 'Home card', expanded: false },
  { screen: 'expanded departures', expanded: true },
])('$screen header', ({ expanded }) => {
  it.each([
    { fontScale: 1, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '38%', textAlignment: 'right' },
    { fontScale: 1.35, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '38%', textAlignment: 'right' },
    { fontScale: 1.36, direction: 'column', alignment: 'stretch', identityFlex: undefined, lineWidth: '100%', textAlignment: 'left' },
    { fontScale: 3.12, direction: 'column', alignment: 'stretch', identityFlex: undefined, lineWidth: '100%', textAlignment: 'left' },
  ])('lays out identity and line for font scale $fontScale', ({
    fontScale, direction, alignment, identityFlex, lineWidth, textAlignment,
  }) => {
    const { header, identity, line, lineLabel } = headerFor(fontScale, expanded);

    expect(flattenStyle(header.props.style)).toMatchObject({ flexDirection: direction, alignItems: alignment });
    expect(flattenStyle(identity.props.style).flex).toBe(identityFlex);
    expect(elements(identity.props.children).filter(node => node.type === Label).map(node => node.props.children)).toEqual([
      'Southbound Platform A', "King's Cross St. Pancras",
    ]);
    expect(flattenStyle(line.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', maxWidth: lineWidth });
    expect((lineLabel.props as { lines?: unknown }).lines).toEqual([{ id: 'northern', name: 'Northern line' }]);
    expect((lineLabel.props as { align?: unknown }).align).toBe(textAlignment);
    expect((lineLabel.props as { size?: number }).size).toBe(12);
    const [heading, station] = elements(identity.props.children).filter(node => node.type === Label);
    expect(heading.props).toMatchObject({ size: 19, bold: true });
    expect(flattenStyle(heading.props.style)).toMatchObject({ fontWeight: '700' });
    expect(flattenStyle(heading.props.style).fontFamily).toBeUndefined();
    expect(station.props).toMatchObject({ size: 14, tone: 'dim' });
  });
});

it('labels each shared-platform departure with its published line', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('HUBKWG')!;
  const platform = station.platforms[0];
  const tree = PlatformBoard({ selection: { stationId: station.station_id, platform: platform.platform_number,
    direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id }, station,
    style: 'modern', state: { error: null, pending: false, snapshot: { station: { id: station.station_id, name: station.station_name },
      observedAt: '2026-01-01T00:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: platform.platform_number, direction: 'Eastbound', physicalPlatformId: platform.platform_id,
        departures: [{ id: 'train', lineId: 'district', destinationName: 'Ealing', expectedArrival: '2026-01-01T00:01:00Z', secondsToStation: 60, towards: null }] }] } },
    now: Date.parse('2026-01-01T00:00:00Z'), online: true, limited: false, onRetry: () => {}, onReview: () => {} });
  const row = elements(tree).find(node => (node.props as { row?: unknown }).row) as ReactElement<{ lineName?: string }> | undefined;
  expect(row?.props.lineName).toBe('District');
});

it('shows temporary per-line failure separately from static verified support', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('940GZZLUACT')!;
  const platform = station.platforms[0]!;
  const tree = PlatformBoard({ selection: { stationId: station.station_id, platform: platform.platform_number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    station, style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded: true,
    state: { pending: false, error: null, snapshot: { station: { id: station.station_id, name: station.station_name }, observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [],
      catalogue: { stationId: station.station_id, liveState: 'partial', platforms: [], feeds: [{ lineId: 'district', stopAreaId: '940GZZLUACT', liveState: 'unavailable' }] } } },
    onRetry: vi.fn(), onReview: vi.fn(),
  });
  const copy = elements(tree).filter(node => node.type === Label).map(node => Children.toArray(node.props.children).join('')).join('\n');
  expect(copy).toContain('District');
  expect(copy).toContain('Live departures temporarily unavailable');
  expect(copy).not.toContain('Towards not published');
  expect(copy).not.toContain('Live departures available');
});

it.each(['empty', 'outage'] as const)('shows official DLR blank direction and towards with accurate %s coverage', async condition => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('HUBCAW')!;
  const platform = station.platforms.find(p => p.platform_number === '3')!;
  const tree = PlatformBoard({ selection: { stationId: station.station_id, platform: platform.platform_number,
    direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id }, station,
    style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded: true,
    state: condition === 'outage' ? { pending: false, error: 'unavailable' } : { pending: false, error: null,
      snapshot: { station: { id: station.station_id, name: station.station_name }, observedAt: '2026-11-10T12:00:00Z',
        newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [], catalogue: { stationId: station.station_id,
          liveState: 'empty', platforms: [], feeds: [{ lineId: 'dlr', stopAreaId: '940GZZDLCAN', liveState: 'empty' }] } } },
    onRetry: vi.fn(), onReview: vi.fn(),
  });
  const copy = elements(tree).filter(node => node.type === Label).map(node => Children.toArray(node.props.children).join('')).join('\n');
  expect(copy).toContain('Direction not published · Platform 3');
  expect(copy).toContain('DLR · ');
  expect(copy).not.toContain('Towards not published');
  expect(copy).toContain(condition === 'empty' ? 'No upcoming departures' : 'Live departures temporarily unavailable');
  expect(copy).not.toContain('matching await verification');
});

it.each([
  ['HUBEAL', '3', 'Elizabeth line', 'National Rail', true],
  ['HUBEAL', '3', 'Elizabeth line', 'National Rail', false],
  ['HUBKWG', '2', 'Mildmay', 'District', true], ['910GANERLEY', '1', 'Windrush', 'National Rail', true],
  ['HUBKWG', '2', 'Mildmay', 'District', false], ['910GANERLEY', '1', 'Windrush', 'National Rail', false],
] as const)('renders shared TfL %s platform %s coverage for %s / %s with expanded=%s', async (stationId, number, coveredLine, otherLine, expanded) => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number)!;
  const tree = PlatformBoard({ selection: { stationId, platform: number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    station, style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded,
    state: { pending: false, error: null, snapshot: { station: { id: stationId, name: station.station_name }, observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
    onOpen: expanded ? undefined : vi.fn(), onRetry: vi.fn(), onReview: vi.fn(),
  });
  const copy = elements(tree).filter(node => node.type === Label).map(node => Children.toArray(node.props.children).join('')).join('\n');
  const labels = elements(tree).find(node => node.type === LineLabels)!;
  expect((labels.props as { lines?: { name: string }[] }).lines?.map(line => line.name)).toEqual(expect.arrayContaining([coveredLine, otherLine]));
  expect(copy).toContain(otherLine);
  if (otherLine === 'National Rail') expect(copy).toContain('TfL departures only');
  expect(copy).not.toContain('Live departures available');
  expect(copy).toContain(otherLine === 'District' ? 'Platform matching awaits verification' : 'Live departures unsupported');
  for (const service of platform.services.filter(service => service.line_name === otherLine)) {
    if (service.direction_towards) expect(copy).toContain('Towards ' + service.direction_towards);
  }
  expect(copy).not.toContain('Towards not published');
  if (!expanded) {
    const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button');
    const accessibleCopy = (button?.props as { accessibilityLabel?: string }).accessibilityLabel;
    if (otherLine === 'National Rail') expect(accessibleCopy).toContain('TfL departures only');
    expect(accessibleCopy).not.toMatch(/Live departures available|Towards not published/);
    expect(accessibleCopy).toContain(coveredLine);
    expect(accessibleCopy).toContain(otherLine);
  }
});

it.each([true, false])('renders verified Tram blank numbers without inventing labels with expanded=%s', async expanded => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('940GZZCRADD')!;
  const platform = station.platforms.find(p => p.cardinal_direction === 'Eastbound')!;
  const tree = PlatformBoard({ selection: { stationId: station.station_id, platform: '', direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    station, style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded,
    state: { pending: false, error: null, snapshot: { station: { id: station.station_id, name: station.station_name },
      observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
    onOpen: expanded ? undefined : vi.fn(), onRetry: vi.fn(), onReview: vi.fn(),
  });
  const copy = elements(tree).filter(node => node.type === Label).map(node => Children.toArray(node.props.children).join('')).join('\n');
  expect(copy).toContain('Eastbound · Platform number not published');
  expect(copy).not.toContain('Towards not published');
  expect(copy).not.toContain('Live departures available');
  expect(copy).not.toContain('Platform 1');
  if (!expanded) {
    const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button');
    expect((button?.props as { accessibilityLabel?: string }).accessibilityLabel).toContain('Platform number not published');
  }
});

describe.each([
  { style: 'amber', light: false }, { style: 'amber', light: true },
  { style: 'modern', light: false }, { style: 'modern', light: true },
] as const)('$style departure copy in light=$light', ({ style, light }) => {
  it.each([false, true])('renders concise destinations and complete route labels with expanded=%s', expanded => {
    boundary.fontScale = 1;
    boundary.light = light;
    const observedAt = '2026-11-10T12:00:00Z';
    const snapshot: Snapshot = { station: { id: '940GZZLUKSX', name: "King's Cross St. Pancras" },
      observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: 'A', direction: 'Southbound', departures: [
        { id: '1-epping', destinationName: 'Epping Underground Station', towards: null },
        { id: '2-hainault', destinationName: 'Hainault Underground Station', towards: 'Hainault via Newbury Park' },
        { id: '3-embedded', destinationName: 'Hainault Underground Station via Newbury Park', towards: 'Hainault via Newbury Park' },
      ].map(row => ({ ...row, expectedArrival: '2026-11-10T12:01:00Z', secondsToStation: 60 })) }] };
    const tree = PlatformBoard({ selection: { stationId: snapshot.station.id, platform: 'A', direction: 'Southbound' },
      style, now: Date.parse(observedAt), online: true, limited: false, expanded,
      state: { pending: false, error: null, snapshot },
      onOpen: expanded ? undefined : vi.fn(), onRetry: vi.fn(), onReview: vi.fn() });
    const rows = elements(tree).filter(node => 'row' in node.props).map(node => {
      const render = node.type as (props: Element['props']) => ReactElement<{ children?: ReactNode; accessibilityLabel: string }>;
      return render(node.props);
    });
    const texts = rows.map(row => elements(row).filter(node => node.type === 'Text')
      .map(node => Children.toArray(node.props.children).join('')));
    expect(texts[0]).toContain('Epping');
    expect(texts[1]).toContain('Hainault via Newbury Park');
    expect(texts[2]).toContain('Hainault via Newbury Park');
    const suffix = expanded ? ', Expected at 12:01 London time' : '';
    expect(rows.map(row => row.props.accessibilityLabel)).toEqual([
      '1, Epping, 1 min' + suffix,
      '2, Hainault, via Newbury Park, 1 min' + suffix,
      '3, Hainault via Newbury Park, 1 min' + suffix,
    ]);
    if (!expanded) {
      const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
      const label = (button.props as { accessibilityLabel: string }).accessibilityLabel;
      expect(label).toContain('1, Epping, 1 min');
      expect(label).not.toMatch(/Underground Station|Branch unavailable|, ,/);
    }
  });
});


it.each(['amber', 'modern'] as const)('omits redundant metadata for a verified real Baker Street platform in %s', async style => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('940GZZLUBST')!;
  const platform = station.platforms.find(platform => platform.platform_number === '8')!;
  expect(platform).toBeDefined();
  const tree = PlatformBoard({ station, selection: { stationId: station.station_id,
    platform: platform.platform_number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    style, now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false,
    state: { pending: false, error: null, snapshot: { station: { id: station.station_id, name: station.station_name },
      observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
    onOpen: vi.fn(), onRetry: vi.fn(), onReview: vi.fn() });
  const labels = elements(tree).filter(node => node.type === Label);
  expect(labels.map(node => Children.toArray(node.props.children).join('')).join(' '))
    .not.toMatch(/TfL departures|Live departures available|Towards|Platform description/);
  expect(labels.filter(node => (node.props as { size?: number }).size === 11)).toHaveLength(0);
  const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
  expect((button.props as { accessibilityLabel: string }).accessibilityLabel)
    .not.toMatch(/TfL departures|Live departures available|Towards|Platform description/);
});

it.each([
  { online: false, limited: false, error: null, observedAt: '2026-11-10T12:00:00Z', expected: 'Offline · Predictions may be outdated' },
  { online: true, limited: false, error: null, observedAt: '2026-11-10T11:00:00Z', expected: 'Predictions may be outdated' },
  { online: true, limited: true, error: null, observedAt: '2026-11-10T12:00:00Z', expected: 'Too many requests · Try again shortly' },
  { online: true, limited: false, error: 'unavailable', observedAt: '2026-11-10T12:00:00Z', expected: 'Predictions may be outdated' },
] as const)('preserves visible and accessible $expected', ({ online, limited, error, observedAt, expected }) => {
  const tree = PlatformBoard({ selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
    style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online, limited,
    state: { pending: false, error, snapshot: { station: { id: '940GZZLUKSX', name: "King's Cross St. Pancras" },
      observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
    onOpen: vi.fn(), onRetry: vi.fn(), onReview: vi.fn() });
  const copy = elements(tree).filter(node => node.type === Label)
    .map(node => Children.toArray(node.props.children).join('')).join(' ');
  const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
  expect(copy).toContain(expected);
  expect((button.props as { accessibilityLabel: string }).accessibilityLabel).toContain(expected);
});

it('deduplicates repeated service caveats in visible and accessible summaries', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const source = catalogue.stationsById.get('HUBKWG')!;
  const platform = source.platforms.find(platform => platform.platform_number === '2')!;
  const station = { ...source, platforms: [{ ...platform, services: [...platform.services, ...platform.services] }] };
  const tree = PlatformBoard({ station, selection: { stationId: station.station_id, platform: platform.platform_number,
    direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id }, style: 'amber',
    state: { pending: false, error: null }, now: 0, online: true, limited: false,
    onOpen: vi.fn(), onRetry: vi.fn(), onReview: vi.fn() });
  const copy = elements(tree).filter(node => node.type === Label)
    .map(node => Children.toArray(node.props.children).join('')).join(' ');
  const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
  const accessible = (button.props as { accessibilityLabel: string }).accessibilityLabel;
  expect(copy.match(/Platform matching awaits verification/g)).toHaveLength(1);
  expect(accessible.match(/Platform matching awaits verification/g)).toHaveLength(1);
});
