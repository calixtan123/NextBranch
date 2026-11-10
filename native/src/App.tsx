import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, StatusBar, useColorScheme } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DeparturesScreen, HomeScreen } from './LiveScreens';
import { AppearanceScreen, CardDisplayScreen, ManageScreen, SettingsScreen } from './ManageScreens';
import { navigationRef, type Routes } from './navigation';
import { createRuntime } from './runtime';
import { Runtime } from './screen-context';
import { PickerScreen, SearchScreen } from './SearchScreens';
import { paletteFor, Theme } from './theme';

const Stack = createNativeStackNavigator<Routes>();

/** Root native stack, preference session and visible-station ownership. */
export function App() {
  const [runtime] = useState(createRuntime);
  const [reducedMotion, setReducedMotion] = useState(false);
  const light = useColorScheme() === 'light';
  const palette = paletteFor(light);
  const { preferences, stations, catalogue, synthetic } = runtime;
  const syncVisible = () => {
    if (!navigationRef.isReady()) return;
    const screen = navigationRef.getCurrentRoute();
    if (screen?.name === 'Home') {
      stations.own(preferences.get().cards.filter(catalogue.has).map(card => card.stationId));
    } else if (screen?.name === 'Departures') {
      const selection = (screen.params as Routes['Departures']).selection;
      stations.own(catalogue.has(selection) ? [selection.stationId] : []);
    } else {
      stations.own([]);
    }
  };
  useEffect(() => {
    let current = true;
    let undoTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = preferences.subscribe(() => {
      syncVisible();
      clearTimeout(undoTimer);
      const removal = preferences.get().removal;
      if (removal) undoTimer = setTimeout(preferences.expireUndo, Math.max(0, removal.expiresAt - Date.now()));
    });
    void preferences.load();
    if (AppState.currentState) stations.setActive(AppState.currentState === 'active');
    const foreground = AppState.addEventListener('change', state => {
      preferences.expireUndo();
      stations.setActive(state === 'active');
    });
    const network = synthetic ? undefined : NetInfo.addEventListener(state => {
      stations.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => { if (current) setReducedMotion(enabled); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      current = false;
      clearTimeout(undoTimer);
      subscription();
      foreground.remove();
      network?.();
      motion.remove();
      stations.dispose();
    };
  }, [catalogue, preferences, stations, synthetic]);

  const systemTheme = light ? DefaultTheme : DarkTheme;
  return <SafeAreaProvider>
    <Theme.Provider value={palette}>
      <Runtime.Provider value={runtime}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.surface }}>
          <StatusBar barStyle={light ? 'dark-content' : 'light-content'} />
          <NavigationContainer ref={navigationRef} onReady={syncVisible} onStateChange={syncVisible}
            theme={{ ...systemTheme, colors: { ...systemTheme.colors, background: palette.bg, card: palette.surface,
              text: palette.fg, border: palette.border } }}>
            <Stack.Navigator initialRouteName="Home" screenOptions={{
              headerShown: false,
              animation: reducedMotion ? 'none' : 'default',
              contentStyle: { backgroundColor: palette.bg },
            }}>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="Picker" component={PickerScreen} />
              <Stack.Screen name="Departures" component={DeparturesScreen} />
              <Stack.Screen name="Manage" component={ManageScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Appearance" component={AppearanceScreen} />
              <Stack.Screen name="CardDisplay" component={CardDisplayScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaView>
      </Runtime.Provider>
    </Theme.Provider>
  </SafeAreaProvider>;
}
