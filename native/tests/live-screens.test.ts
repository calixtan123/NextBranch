/** Exercises departure save actions with real preferences and shallow native UI boundaries. */
import { Children, isValidElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { createCatalogue } from '../src/catalogue';
import { createPreferences, selectionKey, type Selection } from '../src/preferences';
import type { Screen } from '../src/navigation';
import { DeparturesScreen } from '../src/LiveScreens';

const hooks = vi.hoisted(() => ({ runtime: vi.fn(), preferences: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', AccessibilityInfo: { announceForAccessibility: vi.fn() } }));
vi.mock('../src/screen-context', () => ({
  Surface: 'Surface', TextAction: 'TextAction',
  useRuntime: hooks.runtime, usePreferences: hooks.preferences,
  useBoardTime: () => 0,
  useRefresh: () => ({ refresh: vi.fn(), refreshing: false }),
}));
vi.mock('../src/PlatformBoard', () => ({ PlatformBoard: 'PlatformBoard', platformName: () => 'Platform A' }));
vi.mock('../src/theme', () => ({ Action: 'Action', IconButton: 'IconButton', Label: 'Label', Result: 'Result', ui: {} }));

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
