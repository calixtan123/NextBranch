import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { createRuntime } from './runtime';
import { IconButton, Label, ui, usePalette } from './theme';

export const Runtime = createContext<ReturnType<typeof createRuntime> | null>(null);
/** Provides app-wide native owners to active screens. */
export function useRuntime() {
  const runtime = useContext(Runtime);
  if (!runtime) throw new Error('Missing native runtime');
  return runtime;
}

/** Reads the current immutable preference snapshot. */
export function usePreferences() {
  const { preferences } = useRuntime();
  return useSyncExternalStore(preferences.subscribe, preferences.get);
}

/** Samples the live clock only while a board screen is visible and foregrounded. */
export function useBoardTime() {
  const { now, stations } = useRuntime();
  useSyncExternalStore(stations.subscribe, stations.version);
  const focused = useIsFocused();
  const [, setTick] = useState(0);
  const active = stations.isActive();
  useEffect(() => {
    if (!active || !focused) return;
    const timer = setInterval(() => setTick(tick => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [active, focused]);
  return now();
}

/** Sends a single accessibility announcement per accepted manual refresh action. */
export function useRefresh() {
  const { stations } = useRuntime();
  const focused = useIsFocused();
  const isFocused = useRef(focused);
  isFocused.current = focused;
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async (ids: string[]) => {
    if (pending.current) return;
    pending.current = true;
    setRefreshing(true);
    try {
      const outcome = await stations.refresh(ids);
      if (outcome && isFocused.current && stations.isActive()) {
        AccessibilityInfo.announceForAccessibility(
          outcome === 'success' ? 'Departure refresh complete' : 'Some departures could not be refreshed');
      }
    } finally {
      pending.current = false;
      setRefreshing(false);
    }
  };
  return { refreshing, refresh };
}

/** Uses native scrolling, safe-area layout from the root and the pinned compact header. */
export function Surface({ title, onBack, headerAction, children, refresh, refreshing = false, scrollEnabled = true }: {
  title: string; onBack?: () => void; headerAction?: ReactNode; children: ReactNode; refresh?: () => void; refreshing?: boolean;
  scrollEnabled?: boolean;
}) {
  const colors = usePalette();
  const preferences = usePreferences();
  const { synthetic } = useRuntime();
  const { width } = useWindowDimensions();
  const [pull, setPull] = useState<'pull' | 'hold'>();
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  const callback = useRef(refresh);
  callback.current = refresh;
  const endPull = () => {
    dragging.current = false;
    clearTimeout(hold.current);
    hold.current = undefined;
    setPull(undefined);
  };
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || !refresh) endPull();
  }, [focused, Boolean(refresh)]);
  useEffect(() => () => clearTimeout(hold.current), []);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={[ui.row, {
      minHeight: 52, paddingHorizontal: onBack ? 4 : 15, paddingRight: 15,
      gap: 4, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1,
    }]}>
      {onBack && <IconButton icon="back" label="Back" onPress={onBack} />}
      <Label size={onBack ? 17 : 18} bold accessibilityRole="header" style={[ui.flex, { letterSpacing: -.5, paddingVertical: 6 }]}>
        {title}
      </Label>
      {headerAction}
    </View>
    <ScrollView style={{ flex: 1 }} scrollEnabled={scrollEnabled}
      automaticallyAdjustKeyboardInsets automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      onScrollBeginDrag={refresh ? () => { dragging.current = true; } : undefined}
      onScrollEndDrag={refresh ? endPull : undefined}
      onScroll={refresh ? event => {
        if (!dragging.current || refreshing) return;
        const distance = -event.nativeEvent.contentOffset.y;
        setPull(distance >= 60 ? 'hold' : distance > 8 ? 'pull' : undefined);
        if (distance >= 60 && !hold.current) {
          hold.current = setTimeout(() => {
            endPull();
            callback.current?.();
          }, 650);
        } else if (distance < 60 && hold.current) {
          clearTimeout(hold.current);
          hold.current = undefined;
        }
      } : undefined}
      scrollEventThrottle={refresh ? 32 : undefined}
      contentContainerStyle={[ui.body, width > 600 && { width: 600, alignSelf: 'center' }]}
      refreshControl={refresh ? <RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={colors.dim} /> : undefined}>
      {(pull || refreshing) && <Label tone="dim" size={11} style={{ textAlign: 'center', marginBottom: 10 }}>
        {refreshing ? 'Refreshing…' : pull === 'hold' ? 'Hold to refresh' : 'Pull down to refresh'}
      </Label>}
      {preferences.warning && <Label tone="warning" style={{ marginBottom: 9 }}>{preferences.warning}</Label>}
      {preferences.ready ? children : <ActivityIndicator accessibilityLabel="Loading saved platforms" color={colors.dim} />}
      {synthetic && <Label size={10} tone="dim" style={{ marginTop: 6 }}>
        Illustrative departures · Synthetic platform labels · Not live
      </Label>}
    </ScrollView>
  </View>;
}

/** A compact text action with a full native touch target. */
export function TextAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [ui.button, { paddingHorizontal: 6, opacity: pressed || disabled ? .55 : 1 }]}>
    <Label tone="selected" size={15}>{label}</Label>
  </Pressable>;
}
