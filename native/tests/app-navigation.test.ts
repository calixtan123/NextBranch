/** Covers App initialization at mocked native and navigation lifecycle boundaries. */
import { Children, isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getStateFromPath } from '@react-navigation/core';
import { App } from '../src/App';
import { plansLinking } from '../src/navigation';
import { createPreferences } from '../src/preferences';
import { createCatalogue } from '../src/catalogue';
import { createStationOwner } from '../src/station-owner';
import { decodeSnapshot, type StationTransport } from '../src/api';
import camden from '../assets/camden-mixed.json';

const boundary = vi.hoisted(() => ({
  effect: vi.fn<(effect: () => void | (() => void)) => void>(),
  runtime: vi.fn(), appearance: vi.fn(), scheme: 'dark',
  slots: [] as unknown[], cursor: 0, subscriptions: [] as (() => void)[],
  navigation: { isReady: vi.fn(() => false), getCurrentRoute: vi.fn() },
  configureNetwork: vi.fn(), subscribeNetwork: vi.fn(), unsubscribeNetwork: vi.fn(),
  network: undefined as ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | undefined,
  foreground: undefined as ((state: string) => void) | undefined,
  removeForeground: vi.fn(), removeMotion: vi.fn(),
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
    addEventListener: () => ({ remove: boundary.removeMotion }),
  },
  AppState: { currentState: 'active', addEventListener: (_event: string, listener: (state: string) => void) => {
    boundary.foreground = listener;
    return { remove: boundary.removeForeground };
  } },
  Appearance: { setColorScheme: boundary.appearance },
  StatusBar: 'StatusBar', useColorScheme: () => boundary.scheme,
}));
vi.mock('@react-native-community/netinfo', () => ({ default: {
  configure: boundary.configureNetwork,
  addEventListener: (listener: typeof boundary.network) => {
    boundary.subscribeNetwork();
    boundary.network = listener;
    return boundary.unsubscribeNetwork;
  },
} }));
vi.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => boundary.navigation,
  NavigationContainer: 'NavigationContainer', DarkTheme: { colors: {} }, DefaultTheme: { colors: {} },
}));
vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' }));
vi.mock('../src/LiveScreens', () => ({ HomeScreen: 'HomeScreen', DeparturesScreen: 'DeparturesScreen' }));
vi.mock('../src/ManageScreens', () => ({
  AppearanceScreen: 'AppearanceScreen', CardDisplayScreen: 'CardDisplayScreen',
  PlansScreen: 'PlansScreen', ManageScreen: 'ManageScreen', SettingsScreen: 'SettingsScreen', AboutScreen: 'AboutScreen',
}));
vi.mock('../src/SearchScreens', () => ({ PickerScreen: 'PickerScreen', PlatformDetailsScreen: 'PlatformDetailsScreen', SearchScreen: 'SearchScreen' }));
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
  boundary.navigation.isReady.mockReturnValue(false);
  boundary.navigation.getCurrentRoute.mockReset();
  boundary.configureNetwork.mockClear();
  boundary.subscribeNetwork.mockClear();
  boundary.unsubscribeNetwork.mockClear();
  boundary.removeForeground.mockClear();
  boundary.removeMotion.mockClear();
  boundary.network = undefined;
  boundary.foreground = undefined;
});
afterEach(() => vi.useRealTimers());

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


const stationId = camden.station.id;
const successfulSnapshot = decodeSnapshot(camden, stationId);

/** Exercises the real owner through the App's native lifecycle callbacks. */
function mountLifecycle(transport: StationTransport, synthetic = false) {
  const stations = createStationOwner(transport);
  const preferences = {
    subscribe: () => () => undefined,
    load: async () => undefined,
    get: () => ({ cards: [{ stationId, platform: 'A', direction: 'Southbound' }], removal: null }),
    expireUndo: vi.fn(),
  };
  boundary.runtime.mockReturnValue({ preferences, stations, catalogue: { has: () => true }, synthetic });
  boundary.navigation.isReady.mockReturnValue(true);
  boundary.navigation.getCurrentRoute.mockReturnValue({ name: 'Home' });
  const tree = App();
  const cleanup = boundary.effect.mock.calls[0][0]();
  return { stations, ready: readyCallback(tree)!, cleanup: () => cleanup?.() };
}

it.each([
  [true, false],
  [true, null],
  [null, null],
  [null, false],
] as const)('lets the API establish availability when connected is %s and reachability is %s', async (isConnected, isInternetReachable) => {
  vi.useFakeTimers({ now: Date.parse(camden.observedAt) });
  const transport = vi.fn<StationTransport>(async () => successfulSnapshot);
  const app = mountLifecycle(transport);
  try {
    boundary.network!({ isConnected, isInternetReachable });
    app.ready();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.stations.isOnline()).toBe(true);
    expect(app.stations.get(stationId)).toMatchObject({ snapshot: successfulSnapshot, error: null, pending: false });
  } finally {
    app.cleanup();
  }
});

it('disables fallback HTTP probes before subscribing to native connectivity', () => {
  const app = mountLifecycle(async () => successfulSnapshot);
  try {
    expect(boundary.configureNetwork).toHaveBeenCalledTimes(1);
    const configuration = boundary.configureNetwork.mock.calls[0][0];
    expect(configuration.reachabilityShouldRun()).toBe(false);
    expect(configuration.useNativeReachability).not.toBe(false);
    expect(boundary.configureNetwork.mock.invocationCallOrder[0]).toBeLessThan(boundary.subscribeNetwork.mock.invocationCallOrder[0]);
  } finally {
    app.cleanup();
  }
});

it('cancels an explicit disconnect and immediately recovers through a reachability false negative on reconnect', async () => {
  vi.useFakeTimers({ now: Date.parse(camden.observedAt) });
  const transport = vi.fn<StationTransport>()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(successfulSnapshot);
  const app = mountLifecycle(transport);
  try {
    app.ready();
    await vi.advanceTimersByTimeAsync(0);
    const signal = transport.mock.calls[0][1];
    boundary.network!({ isConnected: false, isInternetReachable: false });
    expect(signal.aborted).toBe(true);
    expect(app.stations.isOnline()).toBe(false);
    expect(await app.stations.refresh([stationId])).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(app.stations.get(stationId).pending).toBe(false);
    boundary.network!({ isConnected: true, isInternetReachable: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(app.stations.get(stationId)).toMatchObject({ snapshot: successfulSnapshot, error: null, pending: false });
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    app.cleanup();
  }
});

it('keeps API failure visible and refreshes successfully on foreground resume despite false reachability', async () => {
  vi.useFakeTimers({ now: Date.parse(camden.observedAt) });
  const transport = vi.fn<StationTransport>()
    .mockRejectedValueOnce({ kind: 'unavailable' })
    .mockResolvedValue(successfulSnapshot);
  const app = mountLifecycle(transport);
  try {
    boundary.network!({ isConnected: true, isInternetReachable: false });
    app.ready();
    await vi.advanceTimersByTimeAsync(0);
    expect(app.stations.get(stationId)).toMatchObject({ error: 'unavailable', pending: false });
    boundary.foreground!('background');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport).toHaveBeenCalledTimes(1);
    boundary.foreground!('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(app.stations.get(stationId)).toMatchObject({ snapshot: successfulSnapshot, error: null, pending: false });
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    app.cleanup();
  }
});

it('exposes the request deadline and recovers on foreground resume with false reachability', async () => {
  vi.useFakeTimers({ now: Date.parse(camden.observedAt) });
  const transport = vi.fn<StationTransport>()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(successfulSnapshot);
  const app = mountLifecycle(transport);
  try {
    boundary.network!({ isConnected: true, isInternetReachable: false });
    app.ready();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(transport.mock.calls[0][1].aborted).toBe(true);
    expect(app.stations.get(stationId)).toMatchObject({ error: 'timeout', pending: false });
    boundary.foreground!('background');
    boundary.foreground!('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(app.stations.get(stationId)).toMatchObject({ snapshot: successfulSnapshot, error: null, pending: false });
  } finally {
    app.cleanup();
  }
});

it('removes native subscriptions and aborts owned requests when the App unmounts', async () => {
  vi.useFakeTimers();
  const transport = vi.fn<StationTransport>(() => new Promise(() => {}));
  const app = mountLifecycle(transport);
  app.ready();
  await vi.advanceTimersByTimeAsync(0);
  app.cleanup();
  expect(boundary.unsubscribeNetwork).toHaveBeenCalledTimes(1);
  expect(boundary.removeForeground).toHaveBeenCalledTimes(1);
  expect(boundary.removeMotion).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('keeps synthetic fixtures independent of device connectivity and NetInfo configuration', async () => {
  vi.useFakeTimers({ now: Date.parse(camden.observedAt) });
  const app = mountLifecycle(async () => successfulSnapshot, true);
  try {
    app.ready();
    await vi.advanceTimersByTimeAsync(0);
    expect(boundary.configureNetwork).not.toHaveBeenCalled();
    expect(boundary.subscribeNetwork).not.toHaveBeenCalled();
    expect(app.stations.get(stationId)).toMatchObject({ snapshot: successfulSnapshot, error: null, pending: false });
  } finally {
    app.cleanup();
  }
  expect(boundary.unsubscribeNetwork).not.toHaveBeenCalled();
});

it('registers the widget link only for mock plans and initializes Plans with Home behind it', () => {
  const runtime = { stations: {}, catalogue: {}, synthetic: false };
  boundary.runtime.mockReturnValue({ ...runtime, preferences: { get: () => ({}), subscribe: () => () => {} } });
  expect(screenPresentations(App()).some(screen => screen.name === 'Plans')).toBe(false);

  boundary.slots = [];
  boundary.cursor = 0;
  boundary.runtime.mockReturnValue({ ...runtime, preferences: { get: () => ({ mockPlan: 'free' }), subscribe: () => () => {} } });
  const tree = App();
  expect(screenPresentations(tree)).toContainEqual({ name: 'Plans', presentation: 'card' });
  expect(nodes(tree).find(node => node.type === 'NavigationContainer')?.props.linking).toBe(plansLinking);
  const url = 'nextbranch://plans';
  expect(plansLinking.filter?.(url)).toBe(true);
  expect(plansLinking.filter?.('nextbranch://departures')).toBe(false);
  expect(plansLinking.filter?.('nextbranch://plans?pendingSave=untrusted')).toBe(false);
  const path = url.slice(plansLinking.prefixes[0].length);
  const state = getStateFromPath(path, plansLinking.config);
  expect(state?.routes.map(route => route.name)).toEqual(['Home', 'Plans']);
  expect(state?.index).toBe(1);
});
