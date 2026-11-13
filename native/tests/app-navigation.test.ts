/** Covers App initialization at mocked native and navigation lifecycle boundaries. */
import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { createPreferences } from '../src/preferences';
import { createCatalogue } from '../src/catalogue';

const boundary = vi.hoisted(() => ({
  effect: vi.fn<(effect: () => void | (() => void)) => void>(),
  runtime: vi.fn(), appearance: vi.fn(), scheme: 'dark',
  slots: [] as unknown[], cursor: 0, subscriptions: [] as (() => void)[],
  navigation: { isReady: vi.fn(() => false), getCurrentRoute: vi.fn() },
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: boundary.effect,
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.slots)) boundary.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [boundary.slots[index], vi.fn()];
  },
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, get: () => unknown) => {
    if (!get) return {};
    boundary.subscriptions.push(subscribe(vi.fn()));
    return get();
  },
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: vi.fn() }),
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
  Appearance: { setColorScheme: boundary.appearance },
  StatusBar: 'StatusBar', useColorScheme: () => boundary.scheme,
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
  ManageScreen: 'ManageScreen', SettingsScreen: 'SettingsScreen', AboutScreen: 'AboutScreen',
}));
vi.mock('../src/SearchScreens', () => ({ PickerScreen: 'PickerScreen', PlatformDetailsScreen: 'PlatformDetailsScreen', SearchScreen: 'SearchScreen' }));
vi.mock('../src/navigation', () => ({ navigationRef: boundary.navigation }));
vi.mock('../src/runtime', () => ({ createRuntime: boundary.runtime }));
vi.mock('../src/screen-context', () => ({ Runtime: { Provider: 'RuntimeProvider' } }));
vi.mock('../src/theme', () => ({ Theme: { Provider: 'ThemeProvider' }, paletteFor: (light: boolean) => ({ bg: light ? 'paper' : 'charcoal', surface: light ? 'white' : 'black', fg: light ? 'black' : 'white', border: 'border' }) }));

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
  const presentations = screenPresentations(App()).filter(screen => ['Search', 'Picker', 'PlatformDetails', 'Departures'].includes(screen.name));
  expect(presentations).toEqual([
    { name: 'Search', presentation: 'card' },
    { name: 'Picker', presentation: 'card' },
    { name: 'PlatformDetails', presentation: 'card' },
    { name: 'Departures', presentation: 'card' },
  ]);
});


beforeEach(() => {
  boundary.subscriptions.forEach(unsubscribe => unsubscribe());
  boundary.subscriptions = [];
  boundary.slots = [];
  boundary.cursor = 0;
  boundary.effect.mockClear();
  boundary.runtime.mockClear();
  boundary.appearance.mockClear();
  boundary.scheme = 'dark';
});

/** Collects real root presentation props without mounting native stack views. */
function nodes(node: ReactNode): import('react').ReactElement<Record<string, any>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...nodes(child.props.children)] : []);
}

it('subscribes the root presentation to theme changes while retaining its runtime and navigation tree', async () => {
  const preferences = createPreferences({ getItem: async () => null, setItem: async () => undefined }, createCatalogue({ version: 1, platforms: [] }));
  await preferences.load();
  const subscribe = vi.spyOn(preferences, 'subscribe');
  const stations = { own: vi.fn(), setActive: vi.fn(), dispose: vi.fn() };
  const runtime = { preferences, stations, catalogue: { has: () => true }, synthetic: true };
  boundary.runtime.mockReturnValue(runtime);
  const render = () => {
    boundary.cursor = 0;
    boundary.effect.mockClear();
    const tree = App();
    // Execute only the native appearance effect, leaving station ownership isolated.
    boundary.effect.mock.calls.slice(1).forEach(([effect]) => effect());
    return nodes(tree);
  };
  const initial = render();
  expect(subscribe).toHaveBeenCalled();
  const listener = vi.mocked(subscribe).mock.calls[0][0];
  const initialNavigator = initial.find(node => node.type === 'Navigator')!;
  expect(initial.find(node => node.type === 'StatusBar')!.props.barStyle).toBe('light-content');
  expect(boundary.appearance).toHaveBeenLastCalledWith('unspecified');
  boundary.scheme = 'light';
  const systemLight = render();
  expect(systemLight.find(node => node.type === 'ThemeProvider')!.props.value.bg).toBe('paper');
  expect(preferences.get().interfaceTheme).toBeUndefined();
  preferences.setInterfaceTheme('light');
  expect(listener).toHaveBeenCalled();
  const light = render();
  expect(light.find(node => node.type === 'ThemeProvider')!.props.value.bg).toBe('paper');
  expect(light.find(node => node.type === 'NavigationContainer')!.props.theme.colors).toMatchObject({ background: 'paper', card: 'white', text: 'black' });
  expect(light.find(node => node.type === 'StatusBar')!.props.barStyle).toBe('dark-content');
  expect(boundary.appearance).toHaveBeenLastCalledWith('light');
  expect(light.find(node => node.type === 'RuntimeProvider')!.props.value).toBe(runtime);
  expect(light.find(node => node.type === 'Navigator')!.type).toBe(initialNavigator.type);
  expect(boundary.runtime).toHaveBeenCalledTimes(1);
  preferences.setInterfaceTheme('dark');
  boundary.scheme = 'light';
  const dark = render();
  expect(dark.find(node => node.type === 'NavigationContainer')!.props.theme.colors.background).toBe('charcoal');
  expect(dark.find(node => node.type === 'StatusBar')!.props.barStyle).toBe('light-content');
  expect(boundary.appearance).toHaveBeenLastCalledWith('dark');
});

it('registers About and privacy on the native full-screen stack', () => {
  boundary.runtime.mockReturnValue({ preferences: {}, stations: {}, catalogue: {}, synthetic: true });
  const about = nodes(App()).find(node => node.props.name === 'About');
  expect(about?.props.component).toBe('AboutScreen');
  expect(about?.props.options?.presentation ?? 'card').toBe('card');
});
