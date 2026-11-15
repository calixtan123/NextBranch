/** Exercises departure save actions with real preferences and shallow native UI boundaries. */
import { Children, isValidElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createCatalogue } from '../src/catalogue';
import { createPreferences, selectionKey, type Selection } from '../src/preferences';
import type { Screen } from '../src/navigation';
import { DeparturesScreen, HomeScreen, ReviewCard } from '../src/LiveScreens';
import { PlatformBoard } from '../src/PlatformBoard';
import { Result } from '../src/theme';

const hooks = vi.hoisted(() => ({
  runtime: vi.fn(), preferences: vi.fn(), refresh: vi.fn(), announce: vi.fn(),
  appState: vi.fn<(_event: string, _listener: (state: string) => void) => { remove: () => void }>(() => ({ remove: () => {} })), slots: new Map<string, any[]>(), cursor: 0, scope: '',
  effects: [] as (() => void)[],
  cleanups: new Set<() => void>(),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: () => ({ selected: 'blue', surface: 'white', border: 'gray' }),
  useRef: (initial: unknown) => slot(() => ({ current: initial })),
  useState: (initial: unknown) => {
    const slots = hooks.slots.get(hooks.scope)!;
    const index = hooks.cursor;
    const value = slot(() => initial);
    return [value, (next: unknown) => { slots[index] = next; }];
  },
  useMemo: (factory: () => unknown, deps: unknown[]) => {
    const memo = slot(() => ({ deps, value: factory() }));
    if (deps.some((dep, index) => dep !== memo.deps[index])) Object.assign(memo, { deps, value: factory() });
    return memo.value;
  },
  useLayoutEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const memo = slot(() => ({ deps: undefined as unknown[] | undefined, cleanup: undefined as (() => void) | undefined }));
    if (memo.deps && deps.every((dep, index) => dep === memo.deps![index])) return;
    memo.deps = deps;
    hooks.effects.push(() => {
      if (memo.cleanup) {
        memo.cleanup();
        hooks.cleanups.delete(memo.cleanup);
      }
      memo.cleanup = effect() || undefined;
      if (memo.cleanup) hooks.cleanups.add(memo.cleanup);
    });
  },
}));
vi.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ fontScale: 1 }),
  AccessibilityInfo: { announceForAccessibility: hooks.announce },
  AppState: { currentState: 'active', addEventListener: hooks.appState },
}));
vi.mock('react-native-svg', () => ({
  default: 'Svg', Circle: 'Circle', Defs: 'Defs', FeGaussianBlur: 'FeGaussianBlur', Filter: 'Filter',
  Path: 'Path', Pattern: 'Pattern', Rect: 'Rect',
}));
vi.mock('../src/screen-context', () => ({
  Surface: 'Surface', TextAction: 'TextAction',
  useRuntime: hooks.runtime, usePreferences: hooks.preferences,
  useBoardTime: () => 0,
  useRefresh: () => ({ refresh: hooks.refresh, refreshing: false }),
}));
vi.mock('../src/GlassControls', () => ({ GlassAction: 'GlassAction' }));
function slot<T>(initial: () => T): T {
  const slots = hooks.slots.get(hooks.scope)!;
  const index = hooks.cursor++;
  if (!(index in slots)) slots[index] = initial();
  return slots[index];
}

function render<T>(scope: string, component: () => T): T {
  hooks.scope = scope;
  hooks.cursor = 0;
  if (!hooks.slots.has(scope)) hooks.slots.set(scope, []);
  const tree = component();
  hooks.effects.splice(0).forEach(effect => effect());
  return tree;
}

/** Finds the primary save action without mounting native platform components. */
function saveAction(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ primary?: boolean; onPress?: () => void; children?: ReactNode }>(child)) continue;
    if (child.props.primary) return child.props.onPress;
    const action = saveAction(child.props.children);
    if (action) return action;
  }
}

it('returns Home for a duplicate save while preserving the existing saved identity, order and style', async () => {
  const first: Selection = { stationId: '940GZZLUCTN', platform: 'A', direction: 'Southbound' };
  const selection: Selection = { ...first, platform: 'B' };
  const catalogue = createCatalogue({ version: 1, platforms: [first, selection] });
  const preferences = createPreferences({ getItem: async () => null, setItem: async () => undefined }, catalogue);
  await preferences.load();
  preferences.save(first);
  preferences.save(selection);
  preferences.setStyle(selectionKey(selection), 'modern');
  const existingCards = preferences.get().cards;
  hooks.runtime.mockReturnValue({
    catalogue, preferences,
    stations: { get: () => ({ pending: false, error: null }), isOnline: () => true, isRateLimited: () => false },
  });
  hooks.preferences.mockReturnValue(preferences.get());
  const navigation = { goBack: vi.fn(), navigate: vi.fn(), popToTop: vi.fn() };
  const screen = DeparturesScreen({ navigation, route: { params: { selection } } } as unknown as Screen<'Departures'>);

  const save = saveAction(screen);
  expect(save).toBeTypeOf('function');
  save!();

  expect(navigation.popToTop).toHaveBeenCalledOnce();
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(preferences.get().cards).toBe(existingCards);
  expect(preferences.get().cards.map(card => card.platform)).toEqual(['A', 'B']);
  expect(preferences.get().cards[1].style).toBe('modern');
  await preferences.flush();
});

/** Reads labels and controls through the shallow screen boundary. */
function screenElements(node: ReactNode): Array<import('react').ReactElement<Record<string, any>>> {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...screenElements(child.props.children)] : []);
}

it('offers one pull-to-refresh prompt for several failing saved cards without starting a refresh', async () => {
  const cards = [
    { stationId: 'first', platform: '1', direction: 'Eastbound' },
    { stationId: 'second', platform: '2', direction: 'Westbound' },
  ];
  hooks.preferences.mockReturnValue({ cards, mode: 'amber' });
  hooks.runtime.mockReturnValue({ catalogue: { has: () => true }, preferences: readOnlyPreferences(),
    stations: { get: () => ({ pending: false, error: 'unavailable' }), isOnline: () => true, isRateLimited: () => false } });
  const screen = renderHome();
  const nodes = screenElements(screen);
  expect(nodes.filter(node => node.props.children === 'Pull down to refresh')).toHaveLength(1);
  expect(nodes.filter(node => node.type === PlatformBoard).every(node => !('onRetry' in node.props))).toBe(true);
  expect(screen.props.refresh).toBeTypeOf('function');
});

it('keeps Home pull refresh, Add and Undo after removing the bottom refresh icon', async () => {
  const cards = [{ stationId: 'first', platform: '1', direction: 'Eastbound' }];
  const undo = vi.fn().mockReturnValue('restored');
  const navigate = vi.fn();
  hooks.refresh.mockClear();
  hooks.preferences.mockReturnValue({ cards, mode: 'amber', removal: {} });
  hooks.runtime.mockReturnValue({ catalogue: { has: () => true }, preferences: { ...readOnlyPreferences(), undo },
    stations: { get: () => ({ pending: false, error: null }), isOnline: () => true, isRateLimited: () => false } });
  const screen = renderHome(navigate);
  const nodes = screenElements(screen);
  expect(nodes.filter(node => node.props.label === 'Refresh departures')).toHaveLength(0);
  expect(hooks.refresh).not.toHaveBeenCalled();
  screen.props.refresh!();
  expect(hooks.refresh).toHaveBeenCalledWith(['first']);
  nodes.find(node => node.props.label === 'Add a platform')!.props.onPress();
  expect(navigate).toHaveBeenCalledWith('Search');
  nodes.find(node => node.props.children === 'Undo removal')!.props.onPress();
  expect(undo).toHaveBeenCalledOnce();
});


it('explains disabled Home and detail refresh once during shared cooldown and restores guidance after recovery', async () => {
  const cards = [
    { stationId: 'first', platform: '1', direction: 'Eastbound' },
    { stationId: 'first', platform: '2', direction: 'Westbound' },
  ];
  hooks.preferences.mockReturnValue({ cards, mode: 'amber' });
  for (const { limited, error, pullPrompt } of [
    { limited: true, error: 'limited', pullPrompt: false },
    { limited: false, error: 'limited', pullPrompt: true },
    { limited: false, error: null, pullPrompt: false },
  ]) {
    hooks.runtime.mockReturnValue({ catalogue: { has: () => true }, preferences: readOnlyPreferences(),
      stations: { get: () => ({ pending: false, error }), isOnline: () => true, isRateLimited: () => limited } });
    const navigation = { ...navigationForHome(), goBack: vi.fn() };
    const home = renderHome(navigation.navigate, navigation);
    const detail = DeparturesScreen({ navigation, route: { params: { selection: cards[0] } } } as unknown as Screen<'Departures'>);
    for (const screen of [home, detail]) {
      const nodes = screenElements(screen);
      expect(nodes.filter(node => node.props.children === 'Refresh is paused until automatic retry.')).toHaveLength(limited ? 1 : 0);
      expect(nodes.filter(node => node.props.children === 'Pull down to refresh')).toHaveLength(pullPrompt ? 1 : 0);
      expect(typeof screen.props.refresh).toBe(limited ? 'undefined' : 'function');
      const boards = nodes.filter(node => node.type === PlatformBoard);
      expect(boards).toHaveLength(screen === home ? cards.length : 1);
      expect(boards.every(node => node.props.limited === limited)).toBe(true);
    }
    const refresh = screenElements(detail).find(node => node.props.children === 'Refresh')!;
    expect(refresh.props.disabled).toBe(limited);
  }
});


it.each([
  { online: false, error: 'limited' },
  { online: true, error: 'invalid' },
  { online: true, error: 'configuration' },
])('preserves higher-priority recovery guidance for $error online=$online', async ({ online, error }) => {
  const selection = { stationId: 'first', platform: '1', direction: 'Eastbound' };
  hooks.preferences.mockReturnValue({ cards: [selection], mode: 'amber' });
  hooks.runtime.mockReturnValue({ catalogue: { has: () => true }, preferences: readOnlyPreferences(),
    stations: { get: () => ({ pending: false, error }), isOnline: () => online, isRateLimited: () => true } });
  const navigation = { ...navigationForHome(), goBack: vi.fn() };
  for (const screen of [renderHome(navigation.navigate, navigation),
    DeparturesScreen({ navigation, route: { params: { selection } } } as unknown as Screen<'Departures'>)]) {
    expect(screenElements(screen).filter(node => node.props.children === 'Refresh is paused until automatic retry.')).toHaveLength(0);
  }
});

afterEach(() => {
  hooks.cleanups.forEach(cleanup => cleanup());
  hooks.cleanups.clear();
  hooks.appState.mockClear();
  hooks.slots.clear();
  hooks.announce.mockClear();
});

const readOnlyPreferences = () => ({ get: () => hooks.preferences(), subscribe: () => () => {} });
const navigationForHome = (navigate = vi.fn()) => ({
  navigate, isFocused: () => true, addListener: vi.fn<(_event: string, _listener: () => void) => () => void>(() => () => {}),
});
const renderHome = (navigate = vi.fn(), navigation = navigationForHome(navigate)) =>
  render('home', () => HomeScreen({ navigation } as unknown as Screen<'Home'>));

async function setupHome(count: number, review = false) {
  const selections: Selection[] = ['A', 'B', 'C'].slice(0, count).map((platform, index) => ({
    stationId: ['940GZZLUCTN', '940GZZLUCND', '940GZZLUGDG'][index], platform, direction: 'Southbound',
  }));
  const catalogue = createCatalogue({ version: 1, platforms: review ? selections.filter(card => card.platform !== 'B') : selections });
  let raw = JSON.stringify({ version: 1, mode: 'custom', recent: [], cards: selections.map((card, index) => ({
    ...card, style: index === 0 ? 'modern' : 'amber',
  })) });
  const storage = { getItem: async () => raw, setItem: vi.fn(async (_key: string, value: string) => { raw = value; }) };
  const preferences = createPreferences(storage, catalogue);
  await preferences.load();
  const states = new Map(selections.map(card => [card.stationId, { pending: false, error: null }]));
  hooks.runtime.mockReturnValue({ preferences, catalogue, stations: {
    get: (id: string) => states.get(id), isOnline: () => true, isRateLimited: () => false,
  } });
  hooks.preferences.mockImplementation(preferences.get);
  const navigation = { ...navigationForHome(), isFocused: vi.fn(() => true) };
  const screen = () => renderHome(navigation.navigate, navigation);
  const rows = () => screenElements(screen()).filter(node => node.props.onLayout);
  const order = () => preferences.get().cards.map(card => card.platform);
  const reloaded = async () => {
    await preferences.flush();
    const next = createPreferences(storage, catalogue);
    await next.load();
    return next.get().cards.map(card => card.platform);
  };
  return { selections, storage, preferences, navigation, states, screen, rows, order, reloaded };
}

function cardPressable(row: ReturnType<typeof screenElements>[number]) {
  const card = screenElements(row.props.children).find(node => node.type === PlatformBoard || node.type === ReviewCard)!;
  const board = render('card-' + row.key, () => card.type === PlatformBoard
    ? PlatformBoard(card.props as Parameters<typeof PlatformBoard>[0])
    : Result(ReviewCard(card.props as Parameters<typeof ReviewCard>[0]).props));
  return screenElements(board).find(node => node.type === 'Pressable')!.props;
}

const touch = (pageY: number, timestamp: number, identifier = 1) =>
  ({ nativeEvent: { pageY, timestamp, identifier, touches: [{ identifier }] } });
function layout(row: ReturnType<typeof screenElements>[number], y: number, height: number) {
  row.props.onLayout({ nativeEvent: { layout: { y, height } } });
}

it('holds, moves across variable measured heights and persists the review card order once on release', async () => {
  const { rows, screen, order, reloaded, storage, navigation, states, selections } = await setupHome(3, true);
  const frames = rows();
  expect(frames).toHaveLength(3);
  [64, 140, 82].forEach((height, index) => layout(frames[index], [0, 64, 204][index], height));
  const row = frames[0].props;
  const card = cardPressable(frames[0]);
  const start = touch(20, 10);
  card.onTouchStart(start);
  expect(row.onMoveShouldSetResponderCapture(touch(21, 11))).toBe(false);
  expect(screen().props.scrollEnabled).toBe(true);
  expect(screen().props.refresh).toBeTypeOf('function');
  card.onLongPress(start);
  expect(screen().props.scrollEnabled).toBe(false);
  hooks.refresh.mockClear();
  screen().props.refresh!();
  expect(hooks.refresh).not.toHaveBeenCalled();
  const end = touch(190, 650);
  expect(row.onMoveShouldSetResponderCapture(end)).toBe(true);
  row.onResponderGrant(end);
  card.onPressOut(end); // Native Pressable yields to the card's drag responder.
  row.onResponderMove(end);
  expect(order()).toEqual(['A', 'B', 'C']);
  expect(rows()[2].props.style).toEqual(expect.arrayContaining([expect.objectContaining({ outlineWidth: 2 })]));
  expect(rows()[0].props.style).toEqual(expect.arrayContaining([expect.objectContaining({ zIndex: 1 })]));
  row.onResponderRelease(end);
  row.onResponderRelease(end);
  card.onPress(end);
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen().props.scrollEnabled).toBe(true);
  expect(await reloaded()).toEqual(['B', 'C', 'A']);
  expect(storage.setItem).toHaveBeenCalledOnce();
  const moved = screenElements(screen()).find(node => node.type === PlatformBoard && node.props.selection.platform === 'A')!;
  expect(moved.props.style).toBe('modern');
  expect(moved.props.state).toBe(states.get(selections[0].stationId));
});

function startDrag(row: ReturnType<typeof screenElements>[number], from: number, to: number, timestamp = 10) {
  const card = cardPressable(row);
  const start = touch(from, timestamp);
  const end = touch(to, timestamp + 650);
  card.onTouchStart(start);
  card.onLongPress(start);
  expect(row.props.onMoveShouldSetResponderCapture(end)).toBe(true);
  row.props.onResponderGrant(end);
  card.onPressOut(end);
  row.props.onResponderMove(end);
  return { card, end };
}

it('opens an ordinary tap and leaves a single card scrollable and refreshable', async () => {
  const { rows, screen, order, navigation, storage, reloaded } = await setupHome(1);
  const [row] = rows();
  const card = cardPressable(row);
  const start = touch(20, 10);
  card.onTouchStart(start);
  expect(card.onLongPress).toBeUndefined();
  expect(row.props.onMoveShouldSetResponderCapture(touch(22, 12))).toBe(false);
  card.onPress(touch(22, 12));
  expect(navigation.navigate).toHaveBeenCalledWith('Departures', { selection: expect.objectContaining({ platform: 'A' }) });
  expect(card.accessibilityActions).toEqual([]);
  expect(screen().props.scrollEnabled).toBe(true);
  expect(screen().props.refresh).toBeTypeOf('function');
  expect(order()).toEqual(['A']);
  expect(await reloaded()).toEqual(['A']);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('keeps empty Home scrollable and offers an add action', async () => {
  const { rows, screen, navigation, reloaded } = await setupHome(0);
  expect(rows()).toHaveLength(0);
  expect(screen().props.scrollEnabled).toBe(true);
  expect(screen().props.refresh).toBeUndefined();
  screenElements(screen()).find(node => node.props.label === 'Add a platform')!.props.onPress();
  expect(navigation.navigate).toHaveBeenCalledWith('Search');
  expect(await reloaded()).toEqual([]);
});

it('keeps Home refresh and order when measurements are incomplete or a held card never moves', async () => {
  const { rows, screen, navigation, storage, reloaded } = await setupHome(2);
  const [first, second] = rows();
  layout(first, 0, 80);
  const card = cardPressable(first);
  const start = touch(20, 10);
  card.onTouchStart(start);
  card.onLongPress(start);
  card.onPressOut(start);
  card.onPress(start);
  expect(screen().props.scrollEnabled).toBe(true);
  expect(first.props.onMoveShouldSetResponderCapture(touch(80, 660))).toBe(false);
  layout(second, 80, 120);
  const next = touch(20, 1000);
  card.onTouchStart(next);
  card.onLongPress(next);
  expect(screen().props.scrollEnabled).toBe(false);
  card.onPressOut(touch(20, 1600));
  card.onPress(touch(20, 1600));
  expect(screen().props.scrollEnabled).toBe(true);
  expect(screen().props.refresh).toBeTypeOf('function');
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(await reloaded()).toEqual(['A', 'B']);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('keeps the order at the drop boundary and moves to an end slot when dragged beyond it', async () => {
  const { rows, reloaded, storage } = await setupHome(2);
  const [first, second] = rows();
  layout(first, 0, 80);
  layout(second, 80, 120);
  const atBoundary = startDrag(first, 20, 70);
  first.props.onResponderRelease(atBoundary.end);
  expect(await reloaded()).toEqual(['A', 'B']);
  expect(storage.setItem).not.toHaveBeenCalled();
  const beyondList = startDrag(first, 20, 350, 1000);
  first.props.onResponderRelease(beyondList.end);
  expect(await reloaded()).toEqual(['B', 'A']);
  expect(storage.setItem).toHaveBeenCalledOnce();
});

it.each(['termination', 'blur', 'background', 'layout change', 'unmount'])(
  'restores scrolling and suppresses a stale release and press after %s',
  async interruption => {
    const { rows, screen, navigation, storage, reloaded } = await setupHome(2);
    const [first, second] = rows();
    layout(first, 0, 80);
    layout(second, 80, 120);
    hooks.refresh.mockClear();
    const originalRefresh = screen().props.refresh!;
    const { card, end } = startDrag(first, 20, 140);
    originalRefresh();
    expect(hooks.refresh).not.toHaveBeenCalled();
    if (interruption === 'termination') first.props.onResponderTerminate(end);
    if (interruption === 'blur') navigation.addListener.mock.calls.find(([event]) => event === 'blur')![1]();
    if (interruption === 'background') hooks.appState.mock.calls[0][1]('background');
    if (interruption === 'layout change') layout(second, 80, 160);
    if (interruption === 'unmount') {
      hooks.cleanups.forEach(cleanup => cleanup());
      hooks.cleanups.clear();
    }
    first.props.onResponderRelease(end);
    card.onPress(end);
    if (interruption !== 'unmount') {
      expect(screen().props.scrollEnabled).toBe(true);
      expect(screen().props.refresh).toBeTypeOf('function');
    }
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(await reloaded()).toEqual(['A', 'B']);
    expect(storage.setItem).not.toHaveBeenCalled();
  },
);

it.each(['remove', 'reorder'])('cancels after an external %s and ignores handlers from the stale order', async change => {
  const { rows, screen, order, preferences, selections, navigation, storage, reloaded } = await setupHome(3);
  const [first, second, third] = rows();
  layout(first, 0, 80);
  layout(second, 80, 120);
  layout(third, 200, 70);
  const { card, end } = startDrag(first, 20, 260);
  if (change === 'remove') preferences.remove(selectionKey(selections[1]));
  else preferences.move(selectionKey(selections[2]), selectionKey(selections[1]));
  first.props.onResponderRelease(end);
  expect(screen().props.scrollEnabled).toBe(true);
  card.onTouchStart(touch(30, 2000));
  card.onLongPress(touch(30, 2000));
  card.onPress(end);
  card.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
  expect(navigation.navigate).not.toHaveBeenCalled();
  const expected = change === 'remove' ? ['A', 'C'] : ['A', 'C', 'B'];
  expect(order()).toEqual(expected);
  expect(await reloaded()).toEqual(expected);
  expect(storage.setItem).toHaveBeenCalledOnce();
});

it('ignores old responder events after a new hold even when the touch identifier is reused', async () => {
  const { rows, screen, reloaded } = await setupHome(2);
  const [first, second] = rows();
  layout(first, 0, 80);
  layout(second, 80, 120);
  const previous = startDrag(first, 20, 140);
  first.props.onResponderTerminate(previous.end);
  const next = startDrag(first, 20, 140, 2000);
  first.props.onResponderRelease(previous.end);
  previous.card.onPressOut(previous.end);
  expect(screen().props.scrollEnabled).toBe(false);
  first.props.onResponderRelease(next.end);
  expect(await reloaded()).toEqual(['B', 'A']);
});

it('offers accessible move actions without measurements and preserves activation of a review card', async () => {
  const { rows, navigation, selections, reloaded } = await setupHome(2, true);
  const [first, review] = rows();
  const firstCard = cardPressable(first);
  const reviewCard = cardPressable(review);
  expect(firstCard.accessibilityActions.map((action: { name: string }) => action.name)).toEqual(['moveDown']);
  expect(reviewCard.accessibilityActions.map((action: { name: string }) => action.name)).toEqual(['moveUp']);
  reviewCard.onAccessibilityTap();
  expect(navigation.navigate).toHaveBeenCalledWith('Picker', { stationId: selections[1].stationId });
  reviewCard.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
  expect(hooks.announce).toHaveBeenCalledWith('Moved to position 1 of 2');
  expect(await reloaded()).toEqual(['B', 'A']);
  cardPressable(rows()[0]).onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
  expect(hooks.announce).toHaveBeenLastCalledWith('Moved to position 2 of 2');
  expect(await reloaded()).toEqual(['A', 'B']);
});
