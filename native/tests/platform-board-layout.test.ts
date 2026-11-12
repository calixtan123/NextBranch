/** Protects platform identity and line-label layout at ordinary and accessibility text sizes. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { LineLabels } from '../src/LineLabels';
import { PlatformBoard } from '../src/PlatformBoard';
import { Label, paletteFor } from '../src/theme';
import type { Snapshot } from '../src/api';

const boundary = vi.hoisted(() => ({ fontScale: 1, light: false, width: 0,
  surface: { width: 0, height: 0 }, setSurface: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => typeof initial === 'number' ? [boundary.width, vi.fn()]
    : [boundary.surface, boundary.setSurface],
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

it.each(['amber', 'modern'] as const)('sizes the %s dot rectangle from its measured native surface after layout changes', style => {
  for (const surface of [{ width: 0, height: 0 }, { width: 368, height: 45 },
    { width: 368, height: 168.5 }, { width: 418, height: 252 }, { width: 788, height: 97 }]) {
    boundary.surface = surface;
    const tree = PlatformBoard({ selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
      style, state: { error: null, pending: true }, now: 0, online: true, limited: false, onReview: vi.fn() });
    const background = elements(tree).find(node =>
      (node.props as { importantForAccessibility?: string }).importantForAccessibility === 'no-hide-descendants')!;
    expect(background.props).toMatchObject({ pointerEvents: 'none', accessible: false });
    const onLayout = (background.props as { onLayout?: (event: unknown) => void }).onLayout;
    expect(onLayout).toBeTypeOf('function');
    boundary.setSurface.mockClear();
    onLayout!({ nativeEvent: { layout: { width: 418, height: 268.25 } } });
    expect(boundary.setSurface).toHaveBeenLastCalledWith({ width: 418, height: 268.25 });
    const svg = elements(background).find(node => node.type === 'Svg');
    if (!surface.width || !surface.height) {
      expect(svg).toBeUndefined();
    } else {
      expect(svg!.props).toMatchObject({ ...surface, accessible: false });
      expect(elements(svg).find(node => node.type === 'Rect')!.props).toMatchObject(surface);
    }
  }
  boundary.surface = { width: 0, height: 0 };
});

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
function headerFor(fontScale: number, expanded: boolean, style: 'amber' | 'modern') {
  boundary.fontScale = fontScale;
  const tree = PlatformBoard({
    selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
    style, state: { error: null, pending: true }, now: 0, online: true, limited: false,
    expanded, onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn(),
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
  if (!expanded) {
    const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button');
    expect((button?.props as { accessibilityLabel?: string }).accessibilityLabel)
      .toMatch(/^King's Cross St\. Pancras\. Southbound Platform A\. Northern line\./);
  }
  return { header: header!, identity, line, lineLabel: lineLabel! };
}

describe.each([
  { screen: 'Home card', expanded: false, style: 'amber' },
  { screen: 'Home card', expanded: false, style: 'modern' },
  { screen: 'expanded departures', expanded: true, style: 'amber' },
  { screen: 'expanded departures', expanded: true, style: 'modern' },
] as const)('$style $screen header', ({ expanded, style }) => {
  it.each([
    { fontScale: 1, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '40%', textAlignment: 'right' },
    { fontScale: 1.35, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '40%', textAlignment: 'right' },
    { fontScale: 1.36, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '40%', textAlignment: 'right' },
    { fontScale: 3.12, direction: 'row', alignment: 'center', identityFlex: 1, lineWidth: '40%', textAlignment: 'right' },
  ])('lays out identity and line for font scale $fontScale', ({
    fontScale, direction, alignment, identityFlex, lineWidth, textAlignment,
  }) => {
    const { header, identity, line, lineLabel } = headerFor(fontScale, expanded, style);

    expect(flattenStyle(header.props.style)).toMatchObject({ flexDirection: direction, alignItems: alignment });
    expect(flattenStyle(identity.props.style).flex).toBe(identityFlex);
    expect(elements(identity.props.children).filter(node => node.type === Label).map(node => node.props.children)).toEqual([
      "King's Cross St. Pancras", 'Southbound Platform A',
    ]);
    expect(flattenStyle(line.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', maxWidth: lineWidth });
    expect((lineLabel.props as { lines?: unknown }).lines).toEqual([{ id: 'northern', name: 'Northern line' }]);
    expect((lineLabel.props as { align?: unknown }).align).toBe(textAlignment);
    expect((lineLabel.props as { size?: number }).size).toBe(12);
    const [heading, platform] = elements(identity.props.children).filter(node => node.type === Label);
    expect(heading.props).toMatchObject({ size: 19, bold: true });
    expect(flattenStyle(heading.props.style)).toMatchObject({ fontWeight: '700' });
    expect(flattenStyle(heading.props.style).fontFamily).toBeUndefined();
    expect(platform.props).toMatchObject({ size: 14, tone: 'dim' });
    expect(heading.props).not.toHaveProperty('numberOfLines');
    expect(heading.props).not.toHaveProperty('adjustsFontSizeToFit', true);
    expect(heading.props).not.toHaveProperty('allowFontScaling', false);
  });
});

it.each([false, true])('keeps a complete Hammersmith & City identity in the right-hand column, expanded=%s', async expanded => {
  boundary.fontScale = 1;
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('940GZZLUBST')!;
  const original = station.platforms[0];
  const platform = { ...original, services: [{ ...original.services[0], line_id: 'hammersmith-city' as const,
    line_name: 'Hammersmith & City' }] };
  const tree = PlatformBoard({ station: { ...station, platforms: [platform] },
    selection: { stationId: station.station_id, platform: platform.platform_number,
      direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    style: 'amber', state: { error: null, pending: true }, now: 0, online: true, limited: false,
    expanded, onReview: vi.fn() });
  const header = elements(tree).find(node => node.type === View && Children.toArray(node.props.children).some(child =>
    isValidElement<Element['props']>(child) && Children.toArray(child.props.children).some(label =>
      isValidElement(label) && label.type === LineLabels)))!;
  const [identity, line] = Children.toArray(header.props.children) as Element[];
  // The identity can wrap within its column while line names stay on the right.
  expect(flattenStyle(header.props.style).flexWrap).toBe('nowrap');
  expect(flattenStyle(identity.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
  expect(flattenStyle(line.props.style)).toMatchObject({ flexShrink: 0, maxWidth: '40%' });
  const lineLabel = elements(line.props.children).find(node => node.type === LineLabels)!;
  const rendered = LineLabels(lineLabel.props as Parameters<typeof LineLabels>[0]);
  const pair = Children.toArray(rendered.props.children)[0] as Element;
  const label = elements(pair.props.children).find(node => node.type === Label)!;
  expect(label.props.children).toBe('Hammersmith & City');
  const text = label as ReactElement<Parameters<typeof Label>[0]>;
  expect(text.props.numberOfLines).toBeUndefined();
  expect(text.props.adjustsFontSizeToFit).not.toBe(true);
  expect(text.props.allowFontScaling).not.toBe(false);
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
    now: Date.parse('2026-01-01T00:00:00Z'), online: true, limited: false, onReview: () => {} });
  const row = elements(tree).find(node => (node.props as { row?: unknown }).row) as ReactElement<{ row: { identity: string } }> | undefined;
  expect(row?.props.row.identity).toBe('Ealing (District)');
});

it('shows temporary per-line failure separately from static verified support', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const station = catalogue.stationsById.get('940GZZLUACT')!;
  const platform = station.platforms[0]!;
  const tree = PlatformBoard({ selection: { stationId: station.station_id, platform: platform.platform_number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
    station, style: 'modern', now: Date.parse('2026-11-10T12:00:00Z'), online: true, limited: false, expanded: true,
    state: { pending: false, error: null, snapshot: { station: { id: station.station_id, name: station.station_name }, observedAt: '2026-11-10T12:00:00Z', newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [],
      catalogue: { stationId: station.station_id, liveState: 'partial', platforms: [], feeds: [{ lineId: 'district', stopAreaId: '940GZZLUACT', liveState: 'unavailable' }] } } },
    onReview: vi.fn(),
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
    onReview: vi.fn(),
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
    onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn(),
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
    expect(accessibleCopy!.indexOf('No departures currently assigned to this platform'))
      .toBeLessThan(accessibleCopy!.lastIndexOf('. ' + otherLine + ' · '));
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
    onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn(),
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
      onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn() });
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
      '2, Hainault via Newbury Park, 1 min' + suffix,
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
    onOpen: vi.fn(), onReview: vi.fn() });
  const labels = elements(tree).filter(node => node.type === Label);
  expect(labels.map(node => Children.toArray(node.props.children).join('')).join(' '))
    .not.toMatch(/TfL departures|Live departures available|Towards|Platform description/);
  expect(labels.filter(node => (node.props as { size?: number }).size === 11)).toHaveLength(0);
  const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
  expect((button.props as { accessibilityLabel: string }).accessibilityLabel)
    .not.toMatch(/TfL departures|Live departures available|Towards|Platform description/);
});

describe.each([false, true])('compact status with expanded=%s', expanded => {
  it.each([
    { age: 29_999, online: true, error: null, tone: 'success', expected: 'Live departures up to date' },
    { age: 30_000, online: true, error: null, tone: 'success', expected: 'Live departures up to date' },
    { age: 30_001, online: true, error: null, tone: 'warning', expected: 'Departures are over 30 seconds old' },
    { age: 0, online: false, error: null, tone: 'danger', expected: 'Offline. Predictions may be outdated' },
    { age: 0, online: true, error: 'unavailable', tone: 'danger', expected: 'Departures request failed. Predictions may be outdated' },
  ] as const)('exposes $expected with a $tone dot', ({ age, online, error, tone, expected }) => {
    for (const light of [false, true]) {
      boundary.light = light;
      const observedAt = '2026-11-10T12:00:00Z';
      const tree = PlatformBoard({ selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
        style: 'modern', now: Date.parse(observedAt) + age, online, limited: false, expanded,
        state: { pending: true, error, snapshot: { station: { id: '940GZZLUKSX', name: "King's Cross St. Pancras" },
          observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] } },
        onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn() });
      const copy = elements(tree).filter(node => node.type === Label)
        .map(node => Children.toArray(node.props.children).join('')).join(' ');
      expect(copy).not.toMatch(/Updated|Updating|Predictions may be outdated|seconds old/);
      const dot = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'image')!;
      expect(flattenStyle(dot.props.style)).toEqual({ width: 8, height: 8, borderRadius: 4, backgroundColor: paletteFor(light)[tone] });
      expect(dot.props).toMatchObject({ accessible: expanded, accessibilityLabel: expected });
      if (!expanded) {
        const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
        expect((button.props as { accessibilityLabel: string }).accessibilityLabel).toContain(expected);
      }
      expect(copy).not.toContain('Retry');
    }
    boundary.light = false;
  });
});

it('uses a neutral initial loading dot without a separate footer sentence or spinner', () => {
  const tree = PlatformBoard({ selection: { stationId: '940GZZLUKSX', platform: 'A', direction: 'Southbound' },
    style: 'amber', now: 0, online: true, limited: false, expanded: true,
    state: { error: null, pending: true }, onReview: vi.fn() });
  const dot = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'image')!;
  expect(dot.props).toMatchObject({ accessible: true, accessibilityLabel: 'Loading departures' });
  expect(flattenStyle(dot.props.style).backgroundColor).toBe(paletteFor(false).dim);
  expect(elements(tree).filter(node => node.type === 'ActivityIndicator')).toHaveLength(0);
});

it('colours only supported feeds belonging to the selected physical platform', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const source = catalogue.stationsById.get('HUBKWG')!;
  const platform = source.platforms.find(p => p.platform_number === '2')!;
  const service = platform.services.find(s => s.line_id === 'district')!;
  // This shared platform has unverified District mapping, but its live feed is supported.
  const observedAt = '2026-11-10T12:00:00Z';
  for (const [lineId, stopAreaId, tone] of [
    [service.line_id, service.stop_area_naptan_code, 'danger'],
    [service.line_id, 'unrelated-stop', 'success'],
    ['unrelated-line', service.stop_area_naptan_code, 'success'],
    ['national-rail', service.stop_area_naptan_code, 'success'],
  ] as const) {
    const tree = PlatformBoard({ station: source,
      selection: { stationId: source.station_id, platform: platform.platform_number,
        direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
      style: 'amber', now: Date.parse(observedAt), online: true, limited: false, expanded: true,
      state: { error: null, pending: false, snapshot: { station: { id: source.station_id, name: source.station_name },
        observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [],
        catalogue: { stationId: source.station_id, liveState: 'partial', platforms: [], feeds: [{ lineId, stopAreaId, liveState: 'unavailable' }] } } },
      onReview: vi.fn() });
    const dot = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'image')!;
    expect(flattenStyle(dot.props.style).backgroundColor).toBe(paletteFor(false)[tone]);
  }
});

it('deduplicates repeated service caveats in visible and accessible summaries', async () => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const source = catalogue.stationsById.get('HUBKWG')!;
  const platform = source.platforms.find(platform => platform.platform_number === '2')!;
  const station = { ...source, platforms: [{ ...platform, services: [...platform.services, ...platform.services] }] };
  const tree = PlatformBoard({ station, selection: { stationId: station.station_id, platform: platform.platform_number,
    direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id }, style: 'amber',
    state: { pending: false, error: null }, now: 0, online: true, limited: false,
    onOpen: vi.fn(), onReview: vi.fn() });
  const copy = elements(tree).filter(node => node.type === Label)
    .map(node => Children.toArray(node.props.children).join('')).join(' ');
  const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
  const accessible = (button.props as { accessibilityLabel: string }).accessibilityLabel;
  expect(copy.match(/Platform matching awaits verification/g)).toHaveLength(1);
  expect(accessible.match(/Platform matching awaits verification/g)).toHaveLength(1);
});

it.each(['amber', 'modern'] as const)('shares formatted identity across %s Home and detail rows and summaries', async style => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const source = catalogue.stationsById.get('940GZZLUBST')!;
  const platform = source.platforms.find(item => item.services.some(service => service.line_id === 'circle'))!;
  const service = platform.services.find(item => item.line_id === 'circle')!;
  const station = { ...source, platforms: [{ ...platform, services: [service] }] };
  const observedAt = '2026-11-10T12:00:00Z';
  const snapshot: Snapshot = { station: { id: station.station_id, name: station.station_name }, observedAt,
    newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
    platforms: [{ platform: platform.platform_number, direction: platform.cardinal_direction || null,
      physicalPlatformId: platform.platform_id, departures: [{ id: 'train', lineId: 'circle',
        destinationName: 'Hammersmith Underground Station via Paddington', towards: 'Hammersmith via Paddington',
        expectedArrival: '2026-11-10T12:01:00Z', secondsToStation: 60 }] }] };
  const before = JSON.stringify({ snapshot, station });
  for (const expanded of [false, true]) {
    for (const fontScale of [1, 2]) {
      boundary.fontScale = fontScale;
      boundary.width = 390;
      const tree = PlatformBoard({ station, selection: { stationId: station.station_id,
        platform: platform.platform_number, direction: platform.cardinal_direction, physicalPlatformId: platform.platform_id },
        style, now: Date.parse(observedAt), online: true, limited: false, expanded,
        state: { pending: false, error: null, snapshot }, onOpen: expanded ? undefined : vi.fn(),
        onReview: vi.fn() });
      const row = elements(tree).find(node => 'row' in node.props)!;
      const render = row.type as (props: Element['props']) => ReactElement<{ children?: ReactNode; accessibilityLabel: string }>;
      const rendered = render(row.props);
      const expected = 'Hammersmith (Circle) via Paddington';
      expect(rendered.props.accessibilityLabel).toContain('1, ' + expected + ', 1 min');
      if (expanded) expect(rendered.props.accessibilityLabel).toContain('Expected at 12:01 London time');
      const descendants = elements(rendered);
      if (style === 'amber' && fontScale === 1) {
        const values = descendants.filter(node => 'value' in node.props).map(node => (node.props as { value: string }).value);
        expect(values.join(' ')).toContain(expected);
        expect(descendants.filter(node => node.type === 'Text').map(node => node.props.children)).not.toContain(expected);
      } else {
        expect(descendants.filter(node => node.type === 'Text').map(node => node.props.children)).toContain(expected);
      }
      if (!expanded) {
        const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
        expect((button.props as { accessibilityLabel: string }).accessibilityLabel).toContain('1, ' + expected + ', 1 min');
      }
    }
  }
  expect(JSON.stringify({ snapshot, station })).toBe(before);
  boundary.width = 0;
  boundary.fontScale = 1;
});

it.each([
  ['hammersmith-city', ['hammersmith-city'], 'Barking', 'Barking (Hammersmith & City)'],
  ['district', ['district', 'circle'], 'Ealing Broadway', 'Ealing Broadway (District)'],
  ['northern', ['northern'], 'Morden', 'Morden'],
  ['district', ['district', 'district'], 'Ealing Broadway', 'Ealing Broadway'],
  ['district', ['district', 'national-rail'], 'Ealing Broadway', 'Ealing Broadway'],
  [undefined, ['district', 'circle'], 'Barking', 'Barking'],
  ['unknown', ['district', 'circle'], 'Barking', 'Barking'],
] as const)('presents %s departure identity with %j platform memberships through PlatformBoard', async (lineId, ids, destinationName, expected) => {
  const { catalogue } = await import('../../src/lib/catalogue');
  const { lines } = await import('../../src/lib/catalogue/schema');
  const source = catalogue.stationsById.get('940GZZLUBST')!;
  const original = source.platforms[0];
  const service = original.services[0];
  const platform = { ...original, services: ids.map(id => ({ ...service, line_id: id, line_name: lines[id][0] })) };
  const station = { ...source, platforms: [platform] };
  const observedAt = '2026-11-10T12:00:00Z';
  const snapshot: Snapshot = { station: { id: station.station_id, name: station.station_name }, observedAt,
    newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
    platforms: [{ platform: platform.platform_number, direction: platform.cardinal_direction || null,
      physicalPlatformId: platform.platform_id, departures: [{ id: 'train', lineId, destinationName, towards: null,
        expectedArrival: '2026-11-10T12:01:00Z', secondsToStation: 60 }] }] };
  for (const style of ['amber', 'modern'] as const) {
    for (const expanded of [false, true]) {
      for (const legacy of [false, true]) {
        boundary.fontScale = 1;
        boundary.width = 0;
        const tree = PlatformBoard({ station, selection: { stationId: station.station_id,
          platform: platform.platform_number, direction: platform.cardinal_direction,
          physicalPlatformId: legacy ? undefined : platform.platform_id },
          style, now: Date.parse(observedAt), online: true, limited: false, expanded,
          state: { pending: false, error: null, snapshot }, onOpen: expanded ? undefined : vi.fn(),
          onReview: vi.fn() });
        const row = elements(tree).find(node => 'row' in node.props)!;
        const render = row.type as (props: Element['props']) => ReactElement<{ children?: ReactNode; accessibilityLabel: string }>;
        const rendered = render(row.props);
        expect(elements(rendered).filter(node => node.type === 'Text').map(node => node.props.children)).toContain(expected);
        expect(rendered.props.accessibilityLabel).toContain('1, ' + expected + ', 1 min');
        if (!expanded) {
          const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
          expect((button.props as { accessibilityLabel: string }).accessibilityLabel).toContain('1, ' + expected + ', 1 min');
        }
      }
    }
  }
});

describe.each(['amber', 'modern'] as const)('%s Elizabeth departure suffix', style => {
  it.each([
    { expanded: false, width: 0 }, { expanded: true, width: 0 },
    { expanded: false, width: 390 }, { expanded: true, width: 390 },
  ])('uses concise visible and accessible destinations with expanded=$expanded and width=$width', ({ expanded, width }) => {
    boundary.fontScale = 1;
    boundary.width = width;
    boundary.light = false;
    const observedAt = '2026-11-10T12:00:00Z';
    const snapshot: Snapshot = { station: { id: '910GWHITECP', name: 'Whitechapel' },
      observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: 'A', direction: 'Westbound', departures: [
        { id: '1-paddington', destinationName: 'Paddington Rail Station', towards: null },
        { id: '2-reading', destinationName: 'Reading Rail Station', towards: 'Reading via Ealing Broadway' },
        { id: '3-embedded', destinationName: '  Paddington  rAiL  StAtIoN  VIA Ealing Broadway ', towards: 'Paddington via Ealing Broadway' },
      ].map(row => ({ ...row, lineId: 'elizabeth', expectedArrival: '2026-11-10T12:01:00Z', secondsToStation: 60 })) }] };
    const tree = PlatformBoard({ selection: { stationId: snapshot.station.id, platform: 'A', direction: 'Westbound' },
      style, now: Date.parse(observedAt), online: true, limited: false, expanded,
      state: { pending: false, error: null, snapshot },
      onOpen: expanded ? undefined : vi.fn(), onReview: vi.fn() });
    const rows = elements(tree).filter(node => 'row' in node.props).map(node => {
      const render = node.type as (props: Element['props']) => ReactElement<{ children?: ReactNode; accessibilityLabel: string }>;
      return render(node.props);
    });
    const identities = ['Paddington', 'Reading via Ealing Broadway', 'Paddington VIA Ealing Broadway'];
    rows.forEach((row, index) => {
      const descendants = elements(row);
      if (style === 'amber' && width > 0) {
        const values = descendants.filter(node => 'value' in node.props).map(node => (node.props as { value: string }).value);
        expect(values.join(' ')).toContain(identities[index]);
      } else {
        expect(descendants.filter(node => node.type === 'Text').map(node => node.props.children)).toContain(identities[index]);
      }
      expect(row.props.accessibilityLabel).toBe(`${index + 1}, ${identities[index]}, 1 min` +
        (expanded ? ', Expected at 12:01 London time' : ''));
    });
    expect(rows).toHaveLength(3);
    if (!expanded) {
      const button = elements(tree).find(node => (node.props as { accessibilityRole?: string }).accessibilityRole === 'button')!;
      const label = (button.props as { accessibilityLabel: string }).accessibilityLabel;
      identities.forEach((identity, index) => expect(label).toContain(`${index + 1}, ${identity}, 1 min`));
      expect(label).not.toMatch(/Rail Station/i);
    }
    boundary.width = 0;
  });
});

it.each([224, 274])('keeps Amber glyph size and destination columns consistent at %s points', destinationWidth => {
  boundary.fontScale = 1;
  boundary.width = destinationWidth + 16 + 62 + 10;
  const observedAt = '2026-11-10T12:00:00Z';
  const identities = ['Morden via Bank', 'Kennington via Charing Cross', 'Hammersmith (Hammersmith & City)'];
  const snapshot: Snapshot = { station: { id: '940GZZLUKSX', name: "King's Cross St. Pancras" },
    observedAt, newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
    platforms: [{ platform: 'A', direction: 'Southbound', departures: identities.map((destinationName, index) => ({
      id: String(index), destinationName, towards: null, expectedArrival: '2026-11-10T12:01:00Z', secondsToStation: 60,
    })) }] };
  for (const expanded of [false, true]) {
    const tree = PlatformBoard({ selection: { stationId: snapshot.station.id, platform: 'A', direction: 'Southbound' },
      style: 'amber', now: Date.parse(observedAt), online: true, limited: false, expanded,
      state: { pending: false, error: null, snapshot }, onReview: vi.fn() });
    const rows = elements(tree).filter(node => 'row' in node.props);
    expect(rows).toHaveLength(identities.length);
    rows.forEach((node, index) => {
      const render = node.type as (props: Element['props']) => Element;
      const row = render(node.props);
      const [ordinal, destination, countdown] = Children.toArray(row.props.children) as Element[];
      expect(flattenStyle(ordinal.props.style).width).toBe(16);
      expect(flattenStyle(countdown.props.style)).toMatchObject({ width: 62, alignItems: 'flex-end' });
      expect(flattenStyle(destination.props.style)).toMatchObject({ flex: 1, alignItems: 'flex-start', gap: 6 });
      const glyphLines = elements(destination).filter(child => 'value' in child.props);
      expect(glyphLines.length).toBeGreaterThan(0);
      expect(glyphLines.map(child => (child.props as { value: string }).value).join(' ')).toBe(identities[index]);
      glyphLines.forEach(child => expect((child.props as { scale: number }).scale).toBe(.85));
    });
  }
  boundary.width = 0;
});
