import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js');

afterEach(() => {
  vi.unstubAllEnvs();
});

it('registers one prototype widget for the medium and large Home Screen sizes', () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_WIDGET_PROTOTYPE', '1');
  vi.stubEnv('NEXTBRANCH_RELEASE_BUILD', '');

  const { plugins } = appConfig({ config: { plugins: [] } });
  const widgetPlugin = plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-widgets');

  expect(widgetPlugin?.[1].widgets).toEqual([expect.objectContaining({
    name: 'SavedPlatforms',
    ios: expect.objectContaining({
      supportedFamilies: ['systemMedium', 'systemLarge'],
    }),
  })]);
});

it('keeps the widget kind and app identity for TestFlight and enables mock gating only for that profile', () => {
  const { build } = require('../eas.json');
  const config = { ios: { bundleIdentifier: 'com.nextbranch.app' }, plugins: [] };
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_API_URL', 'https://www.tfl.gov.uk');
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_WIDGET_PROTOTYPE', '');
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_TESTFLIGHT_WIDGET', '');
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_MOCK_PLANS', '');
  for (const [key, value] of Object.entries(build.production.env)) vi.stubEnv(key, String(value));

  const standard = appConfig({ config });
  expect(standard.plugins).toEqual([]);
  expect(standard.scheme).toBeUndefined();

  expect(build.testflight.extends).toBe('production');
  for (const [key, value] of Object.entries(build.testflight.env)) vi.stubEnv(key, String(value));
  const mock = appConfig({ config });
  expect(mock.ios).toEqual(config.ios);
  expect(mock.scheme).toBe('nextbranch');
  expect(mock.plugins).toEqual([
    ['./widget/with-saved-platform-widget', { mockPlans: true }],
    ['expo-widgets', expect.objectContaining({
      widgets: [expect.objectContaining({ name: 'SavedPlatforms' })],
    })],
  ]);

  vi.stubEnv('NEXTBRANCH_RELEASE_BUILD', '');
  expect(() => appConfig({ config })).toThrow('Mock plans require the TestFlight widget release configuration');
});

it('rechecks the published plan at each station request boundary', () => {
  const source = readFileSync(new URL('../widget/DepartureRefresh.swift', import.meta.url), 'utf8').split('\n');
  const request = source.findIndex(line => line.includes('try await session.data(for: request)'));
  expect(source[request - 1]?.trim()).toBe('guard WidgetPreferences.allowsPublishedAccess else { return StationFetch() }');
});
