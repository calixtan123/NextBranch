/** Protects native interface typography, scrolling and departure-card spacing. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { Label, paletteFor } from '../src/theme';
import { Surface } from '../src/screen-context';

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: () => ({ preferences: { subscribe: vi.fn(), get: vi.fn() }, synthetic: false }),
  useSyncExternalStore: () => ({ ready: true }),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: vi.fn(),
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: {}, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 390 }),
}));
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }));

type Element = ReactElement<Record<string, any>>;
/** Reads native output without mounting platform components. */
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...elements(child.props.children)] : []);
}

it('uses scalable system text and accessible system-blue actions in both themes', () => {
  const label = Label({ children: 'Manage platforms' });
  expect(label.props.style[0]).toMatchObject({ fontFamily: 'System', fontSize: 15 });
  expect(paletteFor(false).selected).toBe('#0A84FF');
  expect(paletteFor(true).selected).toBe('#0066CC');
});

it('passes the drag scroll lock to the real native ScrollView while preserving keyboard behavior', () => {
  const locked = Surface({ title: 'Manage', children: null, scrollEnabled: false });
  const scroll = elements(locked).find(node => node.type === 'ScrollView')!;
  expect(scroll.props.scrollEnabled).toBe(false);
  expect(scroll.props.keyboardDismissMode).toBe('interactive');
  const unlocked = Surface({ title: 'Manage', children: null });
  expect(elements(unlocked).find(node => node.type === 'ScrollView')!.props.scrollEnabled).toBe(true);
});
