/** Exercises real Manage responder callbacks with native boundaries and persistent preferences. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ManageScreen } from '../src/ManageScreens';
import { createCatalogue } from '../src/catalogue';
import { createPreferences, selectionKey, type Selection } from '../src/preferences';
import type { Screen } from '../src/navigation';

const boundary = vi.hoisted(() => ({
  runtime: vi.fn(), preferences: vi.fn(), alert: vi.fn(),
  slots: new Map<string, unknown[]>(), scope: 'screen', cursor: 0,
  cleanups: [] as (() => void)[],
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slots = boundary.slots.get(boundary.scope)!;
    const index = boundary.cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value: unknown) => { slots[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const slots = boundary.slots.get(boundary.scope)!;
    const index = boundary.cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const slots = boundary.slots.get(boundary.scope)!;
    const index = boundary.cursor++;
    if (index in slots) return;
    slots[index] = true;
    const cleanup = effect();
    if (cleanup) boundary.cleanups.push(cleanup);
  },
}));
vi.mock('react-native', () => ({
  View: 'View', Alert: { alert: boundary.alert }, AccessibilityInfo: { announceForAccessibility: vi.fn() },
  PanResponder: { create: (callbacks: unknown) => ({ panHandlers: callbacks }) },
}));
vi.mock('../src/screen-context', () => ({ Surface: 'Surface', useRuntime: boundary.runtime, usePreferences: boundary.preferences }));
vi.mock('../src/PlatformBoard', () => ({ platformName: (card: Selection) => 'Platform ' + card.platform }));
vi.mock('../src/theme', () => ({
  Action: 'Action', Icon: 'Icon', IconButton: 'IconButton', Label: 'Label', Result: 'Result', ui: {},
  usePalette: () => ({ selected: 'blue', surface: 'white', border: 'gray' }),
}));

type Element = ReactElement<Record<string, any>>;
/** Walks shallow output while leaving real component callbacks intact. */
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...elements(child.props.children)] : []);
}
/** Runs a component's hooks in a stable scope across explicit rerenders. */
function render(scope: string, component: () => ReactNode) {
  boundary.scope = scope;
  boundary.cursor = 0;
  if (!boundary.slots.has(scope)) boundary.slots.set(scope, []);
  return component();
}
/** Uses the real preference owner so release assertions cover saved order and style. */
async function setup() {
  const cards: Selection[] = ['A', 'B', 'C'].map(platform => ({ stationId: '940GZZLUCTN', platform, direction: 'Southbound' }));
  const storage = { getItem: async () => null, setItem: vi.fn<(_key: string, _value: string) => Promise<void>>().mockResolvedValue(undefined) };
  const preferences = createPreferences(storage, createCatalogue({ version: 1, platforms: cards }));
  await preferences.load();
  cards.forEach(card => preferences.save(card));
  preferences.setStyle(selectionKey(cards[0]), 'modern');
  await preferences.flush();
  storage.setItem.mockClear();
  const move = vi.spyOn(preferences, 'move');
  boundary.runtime.mockReturnValue({ preferences });
  boundary.preferences.mockImplementation(() => preferences.get());
  const screen = () => render('screen', () => ManageScreen({ navigation: { goBack: vi.fn() }, route: { params: {} } } as unknown as Screen<'Manage'>)) as Element;
  const tree = screen();
  const rows = elements(tree).filter(node => node.props.onLayout);
  [{ y: 0, height: 64 }, { y: 72, height: 120 }, { y: 200, height: 80 }].forEach((layout, index) => rows[index].props.onLayout({ nativeEvent: { layout } }));
  const handleElement = elements(tree).find(node => typeof node.type === 'function' && node.props.drag)!;
  const handle = render('handle', () => (handleElement.type as (props: any) => ReactNode)(handleElement.props)) as Element;
  return { cards, preferences, move, storage, screen, handle: handle.props };
}

beforeEach(() => {
  boundary.slots.clear();
  boundary.cleanups = [];
  boundary.alert.mockClear();
});

it('moves the visible row across measured variable heights and commits once on release', async () => {
  const { handle, screen, move, preferences, storage } = await setup();
  handle.onPanResponderGrant();
  expect(screen().props.scrollEnabled).toBe(false);
  expect(handle.onPanResponderTerminationRequest()).toBe(false);
  handle.onPanResponderMove({}, { dx: 0, dy: 205 });
  const row = elements(screen()).find(node => node.props.onLayout)!;
  expect(row.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ transform: [{ translateY: 205 }], zIndex: 1 })]));
  expect(move).not.toHaveBeenCalled();
  handle.onPanResponderRelease({}, { dx: 0, dy: 205 });
  expect(move).toHaveBeenCalledOnce();
  expect(preferences.get().cards.map(card => card.platform)).toEqual(['B', 'C', 'A']);
  expect(preferences.get().cards[2].style).toBe('modern');
  expect(screen().props.scrollEnabled).toBe(true);
  expect(boundary.alert).not.toHaveBeenCalled();
  await preferences.flush();
  expect(storage.setItem).toHaveBeenCalledOnce();
  expect(JSON.parse(storage.setItem.mock.lastCall![1]).cards).toEqual(preferences.get().cards);
});

it('cancels without persisting and restores scrolling on termination and unmount', async () => {
  const { handle, screen, move, preferences, storage } = await setup();
  handle.onPanResponderGrant();
  handle.onPanResponderMove({}, { dx: 0, dy: 205 });
  handle.onPanResponderTerminate();
  expect(screen().props.scrollEnabled).toBe(true);
  expect(move).not.toHaveBeenCalled();
  handle.onPanResponderGrant();
  expect(screen().props.scrollEnabled).toBe(false);
  boundary.cleanups.forEach(cleanup => cleanup());
  expect(screen().props.scrollEnabled).toBe(true);
  handle.onPanResponderRelease({}, { dx: 0, dy: 205 });
  expect(move).not.toHaveBeenCalled();
  expect(preferences.get().cards.map(card => card.platform)).toEqual(['A', 'B', 'C']);
  await preferences.flush();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('retains tap and accessible move controls without interpreting a horizontal drag as a tap', async () => {
  const { handle, screen, preferences, move } = await setup();
  handle.onPanResponderGrant();
  handle.onPanResponderRelease({}, { dx: 0, dy: 0 });
  expect(boundary.alert).toHaveBeenCalledOnce();
  expect(screen().props.scrollEnabled).toBe(true);
  expect(move).not.toHaveBeenCalled();
  const buttons = boundary.alert.mock.calls[0][2];
  buttons.find((button: any) => button.text === 'Move down').onPress();
  expect(preferences.get().cards.map(card => card.platform)).toEqual(['B', 'A', 'C']);
  handle.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
  expect(preferences.get().cards.map(card => card.platform)).toEqual(['A', 'B', 'C']);
  boundary.alert.mockClear();
  handle.onPanResponderGrant();
  handle.onPanResponderMove({}, { dx: 40, dy: 1 });
  handle.onPanResponderRelease({}, { dx: 0, dy: 0 });
  expect(boundary.alert).not.toHaveBeenCalled();
  expect(screen().props.scrollEnabled).toBe(true);
  await preferences.flush();
});
