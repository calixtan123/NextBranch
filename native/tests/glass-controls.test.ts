/** Protects majority-derived native controls and their accessible material fallback. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { majorityStyle, type Card } from '../src/preferences';
import { GlassAction, GlassSurface } from '../src/GlassControls';
import { HomeScreen } from '../src/LiveScreens';
import { SearchScreen } from '../src/SearchScreens';
import type { Screen } from '../src/navigation';

const boundary = vi.hoisted(() => ({
  snapshot: { cards: [] as Card[], mode: 'custom', recent: [] },
  palette: { bg: '#0B0B0D', fg: '#ECEDEF', dim: '#929398', input: '#252527' },
  supported: true, available: true, state: true as unknown,
  setState: vi.fn(), effects: [] as Array<() => (() => void) | void>,
  reduction: vi.fn(), listener: vi.fn(), remove: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: () => [boundary.state, boundary.setState],
  useEffect: (effect: () => (() => void) | void) => { boundary.effects.push(effect); },
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceTransparencyEnabled: boundary.reduction,
    addEventListener: boundary.listener,
  },
  Pressable: 'Pressable', TextInput: 'TextInput', View: 'View', Keyboard: { dismiss: vi.fn() },
  StyleSheet: { absoluteFill: { position: 'absolute', inset: 0 } },
}));
vi.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView', isLiquidGlassAvailable: () => boundary.available,
  isGlassEffectAPIAvailable: () => boundary.supported,
}));
vi.mock('../src/screen-context', () => ({
  Surface: 'Surface', TextAction: 'TextAction', usePreferences: () => boundary.snapshot,
  useRuntime: () => ({ discovery: { catalogue: null, search: () => ({ state: 'missing-catalogue', stations: [] }) }, catalogue: { has: () => true }, stations: { isOnline: () => true, isRateLimited: () => false } }),
  useBoardTime: () => 0, useRefresh: () => ({ refresh: vi.fn(), refreshing: false }),
}));
vi.mock('../src/PlatformBoard', () => ({ PlatformBoard: 'PlatformBoard' }));
vi.mock('../src/theme', () => ({
  Label: 'Label', Icon: 'Icon', IconButton: 'IconButton', Action: 'Action', Result: 'Result', ui: { button: {}, row: {}, flex: {} },
  usePalette: () => boundary.palette, paletteFor: () => ({ bg: '#0B0B0D' }),
}));

/** Finds shallow native output and its real callback props. */
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...elements(child.props.children)] : []);
}
const card = (style?: 'amber' | 'modern'): Card => ({ stationId: '940GZZLUCTN', platform: 'A', direction: 'Southbound', style });
beforeEach(() => {
  boundary.snapshot = { cards: [], mode: 'custom', recent: [] };
  boundary.palette = { bg: '#0B0B0D', fg: '#ECEDEF', dim: '#929398', input: '#252527' };
  boundary.state = true;
  boundary.effects = [];
  boundary.supported = boundary.available = true;
  boundary.setState.mockClear();
  boundary.reduction.mockResolvedValue(false);
  boundary.listener.mockReturnValue({ remove: boundary.remove });
});

it.each([
  ['amber', [card('modern')], 'amber'], ['modern', [card('amber')], 'modern'],
  ['modern', [], 'modern'], ['amber', [], 'amber'], ['custom', [], 'amber'],
  ['custom', [card('modern'), card('amber')], 'amber'],
  ['custom', [card('modern'), card('modern'), card()], 'modern'],
  ['custom', [card(), card('amber'), card('modern')], 'amber'],
] as const)('derives %s controls from effective saved styles', (mode, cards, expected) => {
  expect(majorityStyle(mode, cards)).toBe(expected);
});

it('preserves Home navigation on all three scoped actions and derives their current accent', () => {
  boundary.snapshot.mode = 'modern';
  const navigation = { navigate: vi.fn() };
  const screen = HomeScreen({ navigation } as unknown as Screen<'Home'>);
  const actions = [...elements(screen), screen.props.headerAction].filter(node => node.type === GlassAction);
  expect(actions.map(node => node.props.label).sort()).toEqual(['Add a platform', 'Manage platforms', 'Search stations']);
  actions.forEach(node => {
    expect(node.props.accent).toBe('modern');
    node.props.onPress();
  });
  expect(navigation.navigate.mock.calls).toEqual(expect.arrayContaining([['Search'], ['Search'], ['Manage']]));
});

it('keeps the station field query, clear callback and neutral selection color inside its material', () => {
  boundary.state = 'Camden';
  const screen = SearchScreen({ navigation: { goBack: vi.fn() } } as unknown as Screen<'Search'>);
  const nodes = elements(screen);
  expect(nodes.some(node => node.type === GlassSurface && node.props.accent === 'amber')).toBe(true);
  const input = nodes.find(node => node.type === 'TextInput')!;
  expect(input.props.value).toBe('Camden');
  expect(input.props.selectionColor).toBe(boundary.palette.fg);
  input.props.onChangeText('Bank');
  expect(boundary.setState).toHaveBeenCalledWith('Bank');
  nodes.find(node => node.props.label === 'Clear station search')!.props.onPress();
  expect(boundary.setState).toHaveBeenCalledWith('');
});

it('preserves a labelled 44-point disabled action with neutral foreground', () => {
  const press = vi.fn();
  const action = GlassAction({ label: 'Search stations', icon: 'search', accent: 'modern', disabled: true, onPress: press });
  expect(action.props).toMatchObject({ accessibilityLabel: 'Search stations', accessibilityRole: 'button', disabled: true, accessibilityState: { disabled: true }, onPress: press });
  expect(action.props.style({ pressed: false })).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 44, minWidth: 44 })]));
  expect(elements(action).find(node => node.type === 'Icon')!.props.tone).toBe('fg');
});

it('starts opaque, reads initial accessibility state and responds to changes with cleanup', async () => {
  const initial = GlassSurface({ accent: 'amber', children: null });
  expect(elements(initial).some(node => node.type === 'GlassView')).toBe(false);
  const cleanup = boundary.effects[0]();
  await Promise.resolve();
  expect(boundary.reduction).toHaveBeenCalledOnce();
  expect(boundary.setState).toHaveBeenCalledWith(false);
  expect(boundary.listener).toHaveBeenCalledWith('reduceTransparencyChanged', expect.any(Function));
  boundary.listener.mock.calls.at(-1)![1](true);
  expect(boundary.setState).toHaveBeenLastCalledWith(true);
  cleanup!();
  expect(boundary.remove).toHaveBeenCalled();
});

it('uses noninteractive glass decoration only when supported and transparency is allowed', () => {
  boundary.state = false;
  const glass = elements(GlassSurface({ accent: 'modern', children: null })).find(node => node.type === 'GlassView')!;
  expect(glass.props).toMatchObject({ pointerEvents: 'none', accessible: false, isInteractive: false, glassEffectStyle: 'regular' });
  boundary.available = false;
  expect(elements(GlassSurface({ accent: 'modern', children: null })).some(node => node.type === 'GlassView')).toBe(false);
  boundary.available = true;
  boundary.supported = false;
  expect(elements(GlassSurface({ accent: 'modern', children: null })).some(node => node.type === 'GlassView')).toBe(false);
});

it('matches the explicit light palette and retains dark action content', () => {
  boundary.state = false;
  boundary.palette = { bg: '#F2F2F3', fg: '#222528', dim: '#60646B', input: '#E5E5EA' };
  const glass = elements(GlassSurface({ accent: 'amber', children: null })).find(node => node.type === 'GlassView')!;
  expect(glass.props.colorScheme).toBe('light');
  const action = GlassAction({ label: 'Add a platform', accent: 'amber', onPress: vi.fn() });
  expect(elements(action).find(node => node.type === 'Label')!.props.tone).toBe('fg');
});

it('keeps fallback when the accessibility read fails and ignores a stale initial read after a change', async () => {
  boundary.reduction.mockRejectedValueOnce(new Error('Setting unavailable'));
  GlassSurface({ accent: 'amber', children: null });
  boundary.effects[0]();
  await Promise.resolve();
  await Promise.resolve();
  expect(boundary.setState).not.toHaveBeenCalled();

  boundary.effects = [];
  boundary.reduction.mockResolvedValue(false);
  GlassSurface({ accent: 'modern', children: null });
  boundary.effects[0]();
  boundary.listener.mock.calls.at(-1)![1](true);
  await Promise.resolve();
  expect(boundary.setState).toHaveBeenCalledExactlyOnceWith(true);
});

it('bounds scalable action text and the Home management group while allowing vertical growth', () => {
  const action = GlassAction({ label: 'Manage platforms', accent: 'amber', onPress: vi.fn() });
  const buttonStyle = action.props.style({ pressed: false });
  expect(buttonStyle).toEqual(expect.arrayContaining([expect.objectContaining({
    maxWidth: '100%', flexShrink: 1, minWidth: 44, minHeight: 44,
  })]));
  const surface = elements(action).find(node => node.type === GlassSurface)!;
  expect(surface.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ maxWidth: '100%' })]));
  const label = elements(action).find(node => node.type === 'Label')!;
  expect(label.props.style).toMatchObject({ flexShrink: 1, minWidth: 0 });
  expect(label.props.numberOfLines).toBeUndefined();
  expect(label.props.allowFontScaling).not.toBe(false);
  expect(buttonStyle.every((style: any) => style.height === undefined && style.maxHeight === undefined)).toBe(true);

  const screen = HomeScreen({ navigation: { navigate: vi.fn() } } as unknown as Screen<'Home'>);
  const group = elements(screen).find(node => node.type === 'View' &&
    Children.toArray(node.props.children).some(child => isValidElement<Record<string, any>>(child) && child.props.label === 'Manage platforms'))!;
  expect(group.props.style).toEqual(expect.arrayContaining([expect.objectContaining({
    maxWidth: '100%', minWidth: 0, flexShrink: 1,
  })]));
});
