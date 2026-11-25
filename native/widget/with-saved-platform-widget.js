// Keep Expo's extension target and bridge. Supply our own WidgetKit timeline and App Intents.
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');
const widgetName = require('../src/widget-name.json');

module.exports = (config, { mockPlans = false } = {}) => withXcodeProject(config, async config => {
  const project = config.modResults;
  const targetName = 'ExpoWidgetsTarget';
  const widgetTarget = project.pbxNativeTargetSection()[project.findTargetKey(targetName)];
  const configurationList = project.pbxXCConfigurationList()[widgetTarget.buildConfigurationList];
  const buildConfigurations = project.pbxXCBuildConfigurationSection();
  for (const { value } of configurationList.buildConfigurations) {
    // WidgetKit needs metadata for the button intents. Xcode's debug launcher can hide
    // the AppIntents dependency from the extractor by moving it into a separate dylib.
    const settings = buildConfigurations[value].buildSettings;
    settings.ENABLE_DEBUG_DYLIB = 'NO';
    if (mockPlans) settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = '"$(inherited) NEXTBRANCH_MOCK_PLANS"';
  }

  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: path.join(__dirname, '../src/widget-refresh.ts'),
    resolve: { alias: { zod: path.dirname(require.resolve('zod/package.json')) } },
  });
  let projection;
  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'NextBranchWidgetProjection', minify: true });
    projection = output[0].code;
  } finally {
    await bundle.close();
  }
  const sources = await Promise.all(['SavedPlatforms.swift', 'DepartureRefresh.swift'].map(
    file => readFile(path.join(__dirname, file), 'utf8'),
  ));
  const source = sources.join('\n').replace('__WIDGET_PROJECTION__', Buffer.from(projection).toString('base64'));
  const target = path.join(config.modRequest.platformProjectRoot, targetName);
  await writeFile(path.join(target, widgetName + '.swift'), source);
  // Expo adds an empty Live Activity to its generated bundle. This prototype exposes one widget.
  await writeFile(path.join(target, 'index.swift'), `import WidgetKit
import SwiftUI
@main
struct NextBranchWidgets: WidgetBundle {
  var body: some Widget {
    if #available(iOS 17.0, *) {
      ${widgetName}()
    }
  }
}
`);
  return config;
});
