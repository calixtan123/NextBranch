import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js');

afterEach(() => {
  vi.unstubAllEnvs();
});

it('registers one prototype widget for both the Home Screen and Lock Screen', () => {
  vi.stubEnv('EXPO_PUBLIC_NEXTBRANCH_WIDGET_PROTOTYPE', '1');
  vi.stubEnv('NEXTBRANCH_RELEASE_BUILD', '');

  const { plugins } = appConfig({ config: { plugins: [] } });
  const widgetPlugin = plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-widgets');

  expect(widgetPlugin?.[1].widgets).toEqual([expect.objectContaining({
    name: 'SavedPlatforms',
    ios: expect.objectContaining({
      supportedFamilies: expect.arrayContaining(['systemMedium', 'systemLarge', 'accessoryRectangular']),
    }),
  })]);
});
