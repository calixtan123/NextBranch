/** Registers the saved-platform snapshot bridge. SwiftUI renders the actual widget. */
import { Text } from '@expo/ui/swift-ui';
import { createWidget } from 'expo-widgets';
import type { WidgetConfiguration } from './widget-timeline';

/** Expo requires an initial layout when creating the native snapshot publisher. */
function SavedPlatformWidget() {
  'widget';
  return <Text>Save a platform in NextBranch</Text>;
}

const widgetName: string = require('./widget-name.json');
export const savedPlatformWidget = createWidget<WidgetConfiguration>(widgetName, SavedPlatformWidget, { pages: [] });
