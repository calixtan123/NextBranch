/** Covers beta information, Settings entry and native external-link outcomes. */
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AboutScreen, SettingsScreen } from '../src/ManageScreens';
import type { Screen } from '../src/navigation';

const boundary = vi.hoisted(() => ({ openURL: vi.fn(), alert: vi.fn() }));
vi.mock('react-native', () => ({
  Switch: 'Switch', View: 'View', Pressable: 'Pressable', AccessibilityInfo: {}, PanResponder: {},
  Linking: { openURL: boundary.openURL }, Alert: { alert: boundary.alert },
}));
vi.mock('../src/screen-context', () => ({
  Surface: 'Surface', useRuntime: () => ({ preferences: {} }), usePreferences: () => ({ ready: true }),
}));
vi.mock('../src/PlatformBoard', () => ({ platformName: vi.fn() }));
vi.mock('../src/theme', () => ({
  Action: 'Action', Icon: 'Icon', IconButton: 'IconButton', Label: 'Label', Result: 'Result',
  ui: { row: {}, button: { minHeight: 44, minWidth: 44 } },
  paletteFor: () => ({ bg: 'charcoal' }), usePalette: () => ({ bg: 'charcoal', surface: 'surface', selected: 'blue' }),
}));

/** Traverses the screen's real elements and callback props. */
function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, any>>(child)
    ? [child, ...elements(child.props.children)] : []);
}

const screen = () => elements(AboutScreen({ navigation: { goBack: vi.fn() } } as unknown as Screen<'About'>));

beforeEach(() => {
  boundary.openURL.mockReset().mockResolvedValue(undefined);
  boundary.alert.mockReset();
});

it('opens About and privacy from Settings while preserving appearance and card management', () => {
  const navigate = vi.fn();
  const nodes = elements(SettingsScreen({ navigation: { goBack: vi.fn(), navigate } } as unknown as Screen<'Settings'>));
  for (const [title, route] of [['Appearance', 'Appearance'], ['Manage cards', 'Manage'], ['About and privacy', 'About']]) {
    nodes.find(node => node.props.title === title)!.props.onPress();
    expect(navigate).toHaveBeenLastCalledWith(route);
  }
});

it('explains local preferences, request processing, beta support and coverage with accessible headings', () => {
  const nodes = screen();
  const copy = nodes.filter(node => node.type === 'Label').map(node => node.props.children).join(' ');
  expect(copy).toContain('Saved platforms, recent stations and appearance preferences stay in local app storage');
  expect(copy).toContain('station IDs');
  expect(copy).toContain('IP address');
  expect(copy).toContain('Google’s reachability service');
  expect(copy).toContain('retention review is pending');
  expect(copy).toContain('TestFlight');
  expect(copy).toContain('Send Beta Feedback');
  expect(copy).not.toContain('GitHub');
  expect(copy).toContain('National Rail live departures are unsupported');
  expect(copy).toContain('browse-only');
  expect(copy).toContain('shared platforms');
  expect(copy).toContain('unofficial');
  expect(copy).toContain('Powered by TfL Open Data');
  expect(copy).toContain('Contains OS data © Crown copyright and database rights 2016');
  expect(copy).toContain('Geomni UK Map data © and database rights [2019]');
  expect(nodes.filter(node => node.props.accessibilityRole === 'header').map(node => node.props.children))
    .toEqual(['Privacy', 'Beta feedback', 'Coverage', 'Data credits']);
  expect(nodes.find(node => node.type === 'Surface')!.props.title).toBe('About and privacy');
});

it.each([
  ['Read TfL data licence', 'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service'],
])('opens %s with a labelled native link and a 44-point touch target', async (label, url) => {
  const link = screen().find(node => node.props.accessibilityLabel === label)!;
  expect(link.props.accessibilityRole).toBe('link');
  expect(link.props.accessibilityHint).toContain('browser');
  expect(link.props.style({ pressed: false })).toContainEqual(expect.objectContaining({ minHeight: 44, minWidth: 44 }));
  await link.props.onPress();
  expect(boundary.openURL).toHaveBeenCalledExactlyOnceWith(url);
  expect(boundary.alert).not.toHaveBeenCalled();
});

it.each(['Read TfL data licence'])('offers recovery when %s fails', async label => {
  boundary.openURL.mockRejectedValue(new Error('Browser unavailable'));
  await screen().find(node => node.props.accessibilityLabel === label)!.props.onPress();
  expect(boundary.alert).toHaveBeenCalledWith('Could not open link', expect.stringContaining('TestFlight'));
  expect(boundary.alert.mock.calls[0][1]).toContain('https://');
});
