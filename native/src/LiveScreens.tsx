import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { byId } from '../../src/lib/northern/stations';
import { boardRows } from './board-model';
import { selectionKey } from './catalogue';
import type { Screen } from './navigation';
import { PlatformBoard, platformName } from './PlatformBoard';
import { GlassAction } from './GlassControls';
import { effectiveStyle, majorityStyle, type Card } from './preferences';
import { Surface, useBoardTime, usePreferences, useRefresh, useRuntime } from './screen-context';
import { Action, IconButton, Label, Result, ui, usePalette, type CardPressInteraction } from './theme';

/** Displays a recoverable review entry for a previously saved, now unknown tuple. */
export function ReviewCard({ stationId, platform, onPress, pressInteraction }: {
  stationId: string; platform?: string; onPress: () => void; pressInteraction?: CardPressInteraction;
}) {
  return <Result title={byId.get(stationId)?.name ?? stationId}
    detail={platform ? `Platform ${platform} needs review. Choose a verified platform.` : 'Review platform selection'}
    onPress={onPress} pressInteraction={pressInteraction} />;
}

type CardFrame = { y: number; height: number };
type Drag = { from: string; to: string; dy: number };
type CardTouch = { key: string; identifier: number; timestamp: number; y: number; held: boolean; claimed: boolean };

const orderOf = (cards: readonly Card[]) => JSON.stringify(cards.map(selectionKey));

function useHomeReorder(cards: readonly Card[], navigation: Screen<'Home'>['navigation'], preferences: ReturnType<typeof useRuntime>['preferences']) {
  const colors = usePalette();
  const order = orderOf(cards);
  const generation = useMemo(() => ({ order, keys: cards.map(selectionKey) }), [order]);
  const rendered = useRef(generation);
  const positions = useRef(new Map<string, CardFrame>());
  const touch = useRef<CardTouch | undefined>(undefined);
  const session = useRef<Drag | undefined>(undefined);
  const [drag, setDrag] = useState<Drag>();
  const foreground = useRef(AppState.currentState == null || AppState.currentState === 'active');
  const mounted = useRef(false);

  const show = (next: Drag | undefined) => {
    session.current = next;
    setDrag(next);
  };
  const cancel = () => {
    if (touch.current) touch.current.held = true;
    if (session.current) show(undefined);
  };
  useLayoutEffect(() => {
    mounted.current = true;
    setDrag(undefined);
    const blur = navigation.addListener('blur', cancel);
    const appState = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (!foreground.current) cancel();
    });
    const unsubscribe = preferences.subscribe(() => {
      if (orderOf(preferences.get().cards) !== rendered.current.order) cancel();
    });
    return () => {
      mounted.current = false;
      session.current = undefined;
      touch.current = undefined;
      blur();
      appState.remove();
      unsubscribe();
    };
  }, [navigation, preferences]);
  useLayoutEffect(() => {
    if (rendered.current === generation) return;
    rendered.current = generation;
    for (const key of positions.current.keys()) {
      if (!generation.keys.includes(key)) positions.current.delete(key);
    }
    cancel();
  }, [generation]);

  const current = () => mounted.current && rendered.current === generation && navigation.isFocused() &&
    foreground.current && orderOf(preferences.get().cards) === order;
  const move = (key: string, target: string) => {
    if (!current() || key === target) return;
    preferences.move(key, target);
    AccessibilityInfo.announceForAccessibility(`Moved to position ${generation.keys.indexOf(target) + 1} of ${cards.length}`);
  };

  const bind = (key: string, index: number, open: () => void) => {
    const match = ({ nativeEvent: event }: GestureResponderEvent) => {
      const active = touch.current;
      if (active?.key === key && active.identifier === event.identifier && event.timestamp >= active.timestamp) return active;
    };
    const targetAt = (dy: number) => {
      const origin = positions.current.get(key)!;
      const center = origin.y + origin.height / 2 + dy;
      let target = key;
      let distance = Math.abs(dy);
      for (const candidate of generation.keys) {
        const frame = positions.current.get(candidate)!;
        const offset = Math.abs(frame.y + frame.height / 2 - center);
        if (offset < distance) {
          target = candidate;
          distance = offset;
        }
      }
      return target;
    };
    const updateDrag = (event: GestureResponderEvent, dropping = false) => {
      const active = match(event);
      if (!current() || !active?.claimed || session.current?.from !== key) return;
      const dy = event.nativeEvent.pageY - active.y;
      if (!Number.isFinite(dy)) return cancel();
      const to = targetAt(dy);
      show(dropping ? undefined : { from: key, to, dy });
      if (dropping) move(key, to);
    };
    const activate = () => {
      if (current() && !session.current) open();
    };
    const pressInteraction: CardPressInteraction = {
      onTouchStart: event => {
        if (!current()) return;
        if (event.nativeEvent.touches.length !== 1) return cancel();
        const { identifier, timestamp, pageY } = event.nativeEvent;
        if (touch.current && timestamp <= touch.current.timestamp) return;
        touch.current = { key, identifier, timestamp, y: pageY, held: false, claimed: false };
      },
      onLongPress: cards.length > 1 ? event => {
        const active = match(event);
        if (!current() || !active || active.held) return;
        active.held = true;
        // Each row has its spacing inside the measured wrapper. A gap or overlapping
        // frames indicate an incomplete measurement or a relayout still in flight.
        let bottom = 0;
        for (const candidate of generation.keys) {
          const frame = positions.current.get(candidate);
          if (!frame || !Number.isFinite(frame.height) || frame.height <= 0 ||
            !Number.isFinite(frame.y) || Math.abs(frame.y - bottom) > 1) return;
          bottom = frame.y + frame.height;
        }
        show({ from: key, to: key, dy: 0 });
      } : undefined,
      onPressOut: event => {
        const active = match(event);
        if (rendered.current === generation && session.current?.from === key && active && !active.claimed) cancel();
      },
      accessibilityActions: [
        ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
        ...(index < cards.length - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
      ],
      onAccessibilityTap: activate,
      onAccessibilityAction: ({ nativeEvent: { actionName } }) => {
        if (!current() || session.current) return;
        const target = actionName === 'moveUp' ? generation.keys[index - 1] :
          actionName === 'moveDown' ? generation.keys[index + 1] : undefined;
        if (target !== undefined) move(key, target);
      },
    };

    return {
      onOpen: () => {
        if (current() && !(touch.current?.key === key && touch.current.held)) open();
      },
      pressInteraction,
      row: {
        onLayout: ({ nativeEvent: { layout: { y, height } } }: LayoutChangeEvent) => {
          if (rendered.current !== generation) return;
          const previous = positions.current.get(key);
          if (session.current && (previous?.y !== y || previous.height !== height)) cancel();
          positions.current.set(key, { y, height });
        },
        // Pressable owns the touch through the hold. Only then may this wrapper
        // take the responder, so it sees distinct release and termination events.
        onMoveShouldSetResponderCapture: (event: GestureResponderEvent) =>
          current() && session.current?.from === key && !!match(event) && event.nativeEvent.touches.length === 1,
        onResponderGrant: (event: GestureResponderEvent) => {
          const active = match(event);
          if (current() && active && session.current?.from === key) {
            active.claimed = true;
            updateDrag(event);
            return true; // Block native takeover after the row claims the drag.
          }
          return false;
        },
        onResponderMove: (event: GestureResponderEvent) => {
          if (event.nativeEvent.touches.length === 1) updateDrag(event);
          else if (rendered.current === generation && match(event)) cancel();
        },
        onResponderRelease: (event: GestureResponderEvent) => updateDrag(event, true),
        onResponderTerminate: (event: GestureResponderEvent) => {
          if (rendered.current === generation && match(event)) cancel();
        },
        onResponderReject: (event: GestureResponderEvent) => {
          if (rendered.current === generation && match(event)) cancel();
        },
        onResponderTerminationRequest: () => !session.current,
        style: [
          drag?.from === key && { transform: [{ translateY: drag.dy }], zIndex: 1, opacity: 0.92 },
          drag?.to === key && drag.from !== key && { outlineColor: colors.selected, outlineWidth: 2, outlineStyle: 'solid' as const, borderRadius: 10 },
        ],
      },
    };
  };

  return { active: Boolean(drag), bind, isDragging: () => Boolean(session.current) };
}

/** Shows the ordered saved platform boards and Home actions. */
export function HomeScreen({ navigation }: Screen<'Home'>) {
  const { stations, catalogue, preferences, discovery } = useRuntime();
  const { cards, mode, removal } = usePreferences();
  const reorder = useHomeReorder(cards, navigation, preferences);
  const accent = majorityStyle(mode, cards);
  const now = useBoardTime();
  const { refresh, refreshing } = useRefresh();
  const ids = cards.filter(catalogue.has).map(card => card.stationId);
  const online = stations.isOnline();
  const limited = stations.isRateLimited();
  const openSearch = () => navigation.navigate('Search');
  const undo = () => {
    const outcome = preferences.undo();
    if (outcome === 'full') navigation.navigate('Manage', { undo: true });
    if (outcome === 'expired') AccessibilityInfo.announceForAccessibility('Undo has expired');
  };
  return <Surface title="NextBranch" scrollEnabled={!reorder.active}
    refresh={ids.length && online && !limited ? () => {
      if (!reorder.isDragging()) void refresh(ids);
    } : undefined}
    refreshing={refreshing} headerAction={<GlassAction icon="search" label="Search stations" accent={accent} onPress={openSearch} />}>
    <View style={[ui.wrap, { justifyContent: 'space-between', columnGap: 4, rowGap: 0, marginBottom: 8 }]}>
      <View style={[ui.row, { gap: 7, flexShrink: 1 }]}>
        <Label size={17} bold accessibilityRole="header" style={{ flexShrink: 1 }}>Saved platforms</Label>
        <Label size={15} tone="dim" accessibilityLabel={cards.length + ' of 3 saved platforms'}>{cards.length}/3</Label>
      </View>
      <View style={[ui.wrap, { columnGap: 0, maxWidth: '100%', minWidth: 0, flexShrink: 1 }]}>
        <GlassAction compact accent={accent} label="Manage platforms" onPress={() => navigation.navigate('Manage')} />
        <IconButton icon="settings" label="Settings" size={16} tone="dim" onPress={() => navigation.navigate('Settings')} />
      </View>
    </View>
    {online && !limited && ids.some(id => {
      const state = stations.get(id);
      return Boolean(state.error && state.error !== 'invalid') ||
        state.snapshot?.catalogue?.feeds?.some(feed => feed.liveState === 'unavailable');
    }) && <Label tone="dim" size={12} style={{ marginBottom: 10 }}>Pull down to refresh</Label>}
    <View>
      {cards.map((card, index) => {
        const key = selectionKey(card);
        const review = () => navigation.navigate('Picker', { stationId: card.stationId });
        const verified = catalogue.has(card);
        const { row, onOpen, pressInteraction } = reorder.bind(key, index,
          verified ? () => navigation.navigate('Departures', { selection: card }) : review);
        return <View key={key} collapsable={false} {...row}>
          {verified
            ? <PlatformBoard selection={card} station={discovery?.catalogue?.stationsByAnyId.get(card.stationId)} style={effectiveStyle(mode, card)}
              state={stations.get(card.stationId)} now={now} online={online} limited={limited}
              onOpen={onOpen} pressInteraction={pressInteraction} onReview={review} />
            : <ReviewCard stationId={card.stationId} platform={card.platform} onPress={onOpen} pressInteraction={pressInteraction} />}
        </View>;
      })}
    </View>
    {!cards.length && <Label tone="dim" style={{ marginBottom: 10 }}>
      Add a TfL platform to see its next departures here.
    </Label>}
    <View style={ui.wrap}>
      {cards.length < 3 && <GlassAction accent={accent} icon="plus" label="Add a platform" onPress={openSearch} />}
      {removal && <Action onPress={undo}>Undo removal</Action>}
    </View>
  </Surface>;
}

/** Shows a single physical platform with its expanded board and save actions. */
export function DeparturesScreen({ navigation, route }: Screen<'Departures'>) {
  const { catalogue, preferences, stations, discovery } = useRuntime();
  const { cards, mode } = usePreferences();
  const { selection } = route.params;
  const saved = cards.find(card => selectionKey(card) === selectionKey(selection));
  const now = useBoardTime();
  const { refresh, refreshing } = useRefresh();
  const state = stations.get(selection.stationId);
  const online = stations.isOnline();
  const limited = stations.isRateLimited();
  const count = boardRows(state.snapshot, selection, now, 5).length;
  const review = () => navigation.navigate('Picker', { stationId: selection.stationId });
  return <Surface title="Platform departures" onBack={navigation.goBack}
    refresh={online && !limited ? () => void refresh([selection.stationId]) : undefined} refreshing={refreshing}>
    {catalogue.has(selection) ? <>
      <Label size={11} tone="dim" style={{ marginBottom: 10 }}>
        Selected physical platform{state.snapshot ? ` · ${count} upcoming` : ''}
      </Label>
      {online && !limited && (state.error && state.error !== 'invalid' ||
        state.snapshot?.catalogue?.feeds?.some(feed => feed.liveState === 'unavailable')) &&
        <Label tone="dim" size={12} style={{ marginBottom: 10 }}>Pull down to refresh</Label>}
      <PlatformBoard selection={selection} station={discovery?.catalogue?.stationsByAnyId.get(selection.stationId)} style={effectiveStyle(mode, saved)} state={state} now={now}
        online={online} limited={limited} expanded onReview={review} />
      <View style={ui.wrap}>
        <Action primary onPress={() => {
          const result = preferences.save(selection);
          if (result === 'full') navigation.navigate('Manage', { replacement: selection });
          if (result === 'saved' || result === 'duplicate') navigation.popToTop();
        }}>{saved ? '✓ Saved' : 'Save platform'}</Action>
        <Action disabled={!online || limited || refreshing || state.pending || state.error === 'configuration' || state.error === 'invalid'}
          onPress={() => void refresh([selection.stationId])}>{refreshing ? 'Refreshing…' : 'Refresh'}</Action>
      </View>
    </> : <>
      <Label tone="dim" style={{ marginBottom: 10 }}>{platformName(selection)} needs review.</Label>
      <ReviewCard stationId={selection.stationId} onPress={review} />
    </>}
  </Surface>;
}
