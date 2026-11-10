/** Protects platform identity and line-label layout at ordinary and accessibility text sizes. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { PlatformBoard } from '../src/PlatformBoard';
import { Label } from '../src/theme';

const boundary = vi.hoisted(() => ({ fontScale: 1 }));
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
  return { ...theme, usePalette: () => theme.paletteFor(false) };
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
  const lineLabel = elements(line.props.children).find(node => node.type === Label);
  expect(lineLabel, 'the header exposes its line label').toBeDefined();
  expect(flattenStyle(lineLabel!.props.style)).toMatchObject({ fontFamily: 'Avenir Next', fontWeight: '700' });
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
      "King's Cross St. Pancras", 'Southbound · Platform A',
    ]);
    expect(flattenStyle(line.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', maxWidth: lineWidth });
    expect(lineLabel.props.children).toBe('Northern line');
    expect(flattenStyle(lineLabel.props.style)).toMatchObject({ flexShrink: 1, textAlign: textAlignment });
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
  expect(copy).toContain('Piccadilly');
  expect(copy).toContain('Live departures available');
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
  expect(copy).toContain('Direction unavailable · Platform 3');
  expect(copy).toContain('DLR · Towards not published');
  expect(copy).toContain(condition === 'empty' ? 'No upcoming departures' : 'Live departures temporarily unavailable');
  expect(copy).not.toContain('matching await verification');
});

it.each([
  ['HUBEAL', '3', 'Elizabeth line', 'National Rail', true],
  ['HUBEAL', '3', 'Elizabeth line', 'National Rail', false],
  ['HUBKWG', '1', 'Mildmay', 'District', true], ['910GANERLEY', '1', 'Windrush', 'National Rail', true],
  ['HUBKWG', '1', 'Mildmay', 'District', false], ['910GANERLEY', '1', 'Windrush', 'National Rail', false],
] as const)('renders shared TfL %s coverage and every published description with expanded=%s', async (stationId, number, coveredLine, otherLine, expanded) => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get(stationId)!;
  const platform = station.platforms.find(p => p.platform_number === number)!;
  const tree = PlatformBoard({ selection: { stationId, platform: number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    station, style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded,
    state: { pending: false, error: null, snapshot: { station: { id: stationId, name: station.station_name }, observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
    onOpen: expanded ? undefined : vi.fn(), onRetry: vi.fn(), onReview: vi.fn(),
  });
  const copy = elements(tree).filter(node => node.type === Label).map(node => Children.toArray(node.props.children).join('')).join('\n');
  expect(copy).toContain(coveredLine);
  expect(copy).toContain(otherLine);
  expect(copy).toContain('TfL departures');
  if (otherLine === 'National Rail') expect(copy).toContain('TfL departures only');
  expect(copy).toContain('Live departures available');
  expect(copy).toContain(otherLine === 'District' ? 'Platform matching awaits verification' : 'Live departures unsupported');
  for (const service of platform.services) expect(copy).toContain(service.direction_towards || 'Towards not published');
  if (!expanded) {
    const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button');
    const accessibleCopy = (button?.props as { accessibilityLabel?: string }).accessibilityLabel;
    expect(accessibleCopy).toContain(otherLine === 'National Rail' ? 'TfL departures only' : 'TfL departures');
    expect(accessibleCopy).toContain(coveredLine);
    expect(accessibleCopy).toContain(otherLine);
  }
});
