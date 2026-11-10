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
