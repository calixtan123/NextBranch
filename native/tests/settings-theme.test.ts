/** Exercises the Settings native Switch through the real preference owner. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { SettingsScreen } from '../src/ManageScreens';
import { createPreferences } from '../src/preferences';
import { createCatalogue } from '../src/catalogue';
import type { Screen } from '../src/navigation';

const boundary = vi.hoisted(() => ({ runtime: vi.fn(), snapshot: vi.fn(), light: false }));
vi.mock('react-native', () => ({ Switch: 'Switch', View: 'View', AccessibilityInfo: {}, Alert: {}, PanResponder: {} }));
vi.mock('../src/screen-context', () => ({ Surface: 'Surface', useRuntime: boundary.runtime, usePreferences: boundary.snapshot }));
vi.mock('../src/PlatformBoard', () => ({ platformName: vi.fn() }));
vi.mock('../src/theme', () => ({
  Action: 'Action', Icon: 'Icon', IconButton: 'IconButton', Label: 'Label', Result: 'Result', ui: { row: {} },
  paletteFor: (light: boolean) => ({ bg: light ? 'paper' : 'charcoal' }),
  usePalette: () => ({ bg: boundary.light ? 'paper' : 'charcoal', surface: 'surface', selected: 'blue' }),
}));

/** Finds native controls while preserving their actual callbacks. */
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...elements(child.props.children)] : []);
}

it('labels the accessible native switch, reflects the effective palette and saves both choices', async () => {
  const preferences = createPreferences({ getItem: async () => null, setItem: async () => undefined }, createCatalogue({ version: 1, platforms: [] }));
  boundary.runtime.mockReturnValue({ preferences });
  boundary.snapshot.mockImplementation(() => preferences.get());
  const screen = () => elements(SettingsScreen({ navigation: { goBack: vi.fn(), navigate: vi.fn() } } as unknown as Screen<'Settings'>));
  const loading = screen().find(node => node.type === 'Switch')!;
  expect(loading.props.disabled).toBe(true);
  await preferences.load();
  const dark = screen();
  const control = dark.find(node => node.type === 'Switch')!;
  expect(control.props).toMatchObject({ accessibilityLabel: 'Dark Mode', accessibilityRole: 'switch', value: true, disabled: false });
  expect(dark.some(node => node.type === 'Label' && node.props.children === 'Dark Mode')).toBe(true);
  expect(dark.some(node => Array.isArray(node.props.style) && node.props.style.some((style: any) => style?.minHeight >= 44))).toBe(true);
  control.props.onValueChange(false);
  expect(preferences.get().interfaceTheme).toBe('light');
  boundary.light = true;
  const light = screen().find(node => node.type === 'Switch')!;
  expect(light.props.value).toBe(false);
  light.props.onValueChange(true);
  expect(preferences.get().interfaceTheme).toBe('dark');
});
