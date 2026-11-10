/** Covers App initialization at mocked native and navigation lifecycle boundaries. */
import { Children, isValidElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { App } from '../src/App';

const boundary = vi.hoisted(() => ({
  effect: vi.fn<(effect: () => void | (() => void)) => void>(),
  runtime: vi.fn(),
  navigation: { isReady: vi.fn(() => false), getCurrentRoute: vi.fn() },
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: boundary.effect,
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: vi.fn() }),
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
  StatusBar: 'StatusBar', useColorScheme: () => 'dark',
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: () => vi.fn() } }));
vi.mock('@react-navigation/native', () => ({
  NavigationContainer: 'NavigationContainer', DarkTheme: { colors: {} }, DefaultTheme: { colors: {} },
}));
vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' }));
vi.mock('../src/LiveScreens', () => ({ HomeScreen: 'HomeScreen', DeparturesScreen: 'DeparturesScreen' }));
vi.mock('../src/ManageScreens', () => ({
  AppearanceScreen: 'AppearanceScreen', CardDisplayScreen: 'CardDisplayScreen',
  ManageScreen: 'ManageScreen', SettingsScreen: 'SettingsScreen',
}));
vi.mock('../src/SearchScreens', () => ({ PickerScreen: 'PickerScreen', SearchScreen: 'SearchScreen' }));
vi.mock('../src/navigation', () => ({ navigationRef: boundary.navigation }));
vi.mock('../src/runtime', () => ({ createRuntime: boundary.runtime }));
vi.mock('../src/screen-context', () => ({ Runtime: { Provider: 'RuntimeProvider' } }));
vi.mock('../src/theme', () => ({ Theme: { Provider: 'ThemeProvider' }, paletteFor: () => ({}) }));

/** Reads the App's real onReady callback from its shallow element tree. */
function readyCallback(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ onReady?: () => void; children?: ReactNode }>(child)) continue;
    if (child.props.onReady) return child.props.onReady;
    const callback = readyCallback(child.props.children);
    if (callback) return callback;
  }
}

it('defers station synchronization until navigation is ready and retains onReady and preference updates', () => {
  let notifyPreferences!: () => void;
  const card = { stationId: '940GZZLUCTN', platform: 'A', direction: 'Southbound' };
  const stations = { own: vi.fn(), setActive: vi.fn(), dispose: vi.fn() };
  const preferences = {
    subscribe: (notify: () => void) => { notifyPreferences = notify; return vi.fn(); },
    load: vi.fn(async () => undefined),
    get: () => ({ cards: [card], removal: null }),
    expireUndo: vi.fn(),
  };
  boundary.runtime.mockReturnValue({ preferences, stations, catalogue: { has: () => true }, synthetic: true });
  boundary.navigation.getCurrentRoute.mockImplementation(() => {
    if (!boundary.navigation.isReady()) throw new Error("The 'navigation' object hasn't been initialized");
    return { name: 'Home' };
  });
  const tree = App();
  const cleanup = boundary.effect.mock.calls[0][0]();

  expect(notifyPreferences).not.toThrow();
  expect(boundary.navigation.getCurrentRoute).not.toHaveBeenCalled();
  expect(stations.own).not.toHaveBeenCalled();

  boundary.navigation.isReady.mockReturnValue(true);
  const onReady = readyCallback(tree);
  expect(onReady).toBeTypeOf('function');
  onReady!();
  expect(stations.own).toHaveBeenLastCalledWith(['940GZZLUCTN']);

  boundary.navigation.getCurrentRoute.mockReturnValue({ name: 'Departures', params: { selection: card } });
  notifyPreferences();
  expect(stations.own).toHaveBeenLastCalledWith(['940GZZLUCTN']);
  boundary.navigation.getCurrentRoute.mockReturnValue({ name: 'Search' });
  notifyPreferences();
  expect(stations.own).toHaveBeenLastCalledWith([]);
  expect(stations.own).toHaveBeenCalledTimes(3);
  cleanup?.();
});

/** Reads registered screen presentations without mounting the native navigation stack. */
function screenPresentations(node: ReactNode): { name: string; presentation: string }[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ name?: string; options?: { presentation?: string }; children?: ReactNode }>(child)) return [];
    if (child.props.name) return [{ name: child.props.name, presentation: child.props.options?.presentation ?? 'card' }];
    return screenPresentations(child.props.children);
  });
}

it('keeps the Search to Picker to Departures flow on full-screen stack cards', () => {
  boundary.runtime.mockReturnValue({ preferences: {}, stations: {}, catalogue: {}, synthetic: true });
  const presentations = screenPresentations(App()).filter(screen => ['Search', 'Picker', 'Departures'].includes(screen.name));
  expect(presentations).toEqual([
    { name: 'Search', presentation: 'card' },
    { name: 'Picker', presentation: 'card' },
    { name: 'Departures', presentation: 'card' },
  ]);
});
