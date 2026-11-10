import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, PanResponder, Switch, View } from 'react-native';
import { byId } from '../../src/lib/northern/stations';
import { selectionKey, type Selection } from './catalogue';
import type { Screen } from './navigation';
import { platformName } from './PlatformBoard';
import { type Mode, type Style } from './preferences';
import { Surface, usePreferences, useRuntime } from './screen-context';
import { Action, Icon, IconButton, Label, Result, paletteFor, ui, usePalette } from './theme';

const name = (selection: Selection) => byId.get(selection.stationId)?.name ?? selection.stationId;
const identity = (selection: Selection) => name(selection) + ' · ' + platformName(selection);
const textInset = { marginHorizontal: 2, marginBottom: 14 };

function ReorderHandle({ label, first, last, drag, move }: {
  label: string; first: boolean; last: boolean; drag: (dy: number, done: boolean, cancelled?: boolean) => void;
  move: (delta: number) => void;
}) {
  const callbacks = useRef({ drag, move });
  callbacks.current = { drag, move };
  const active = useRef(false);
  const travelled = useRef(false);
  useEffect(() => () => {
    if (active.current) {
      active.current = false;
      callbacks.current.drag(0, true, true);
    }
  }, []);
  const tap = () => {
    Alert.alert('Move ' + label, undefined, [
      ...(!first ? [{ text: 'Move up', onPress: () => callbacks.current.move(-1) }] : []),
      ...(!last ? [{ text: 'Move down', onPress: () => callbacks.current.move(1) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  const onTap = useRef(tap);
  onTap.current = tap;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      active.current = true;
      travelled.current = false;
      callbacks.current.drag(0, false);
    },
    onPanResponderMove: (_event, gesture) => {
      if (!active.current) return;
      travelled.current ||= Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) >= 6;
      callbacks.current.drag(gesture.dy, false);
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!active.current) return;
      active.current = false;
      callbacks.current.drag(gesture.dy, true);
      if (!travelled.current && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) < 6) onTap.current();
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderTerminate: () => {
      active.current = false;
      callbacks.current.drag(0, true, true);
    },
  })).current;
  return <View {...pan.panHandlers} style={ui.button} accessible accessibilityRole="button"
    accessibilityLabel={'Reorder ' + label} accessibilityHint="Drag or use Move up and Move down"
    accessibilityActions={[
      { name: 'activate' },
      ...(!first ? [{ name: 'moveUp', label: 'Move up' }] : []),
      ...(!last ? [{ name: 'moveDown', label: 'Move down' }] : []),
    ]}
    onAccessibilityAction={event => {
      const action = event.nativeEvent.actionName;
      if (action === 'moveUp') move(-1);
      else if (action === 'moveDown') move(1);
      else tap();
    }}>
    <Icon name="grip" tone="dim" />
  </View>;
}

/** Manages the saved order or confirms replacement of a specific slot. */
export function ManageScreen({ navigation, route }: Screen<'Manage'>) {
  const { preferences } = useRuntime();
  const { cards, removal } = usePreferences();
  const colors = usePalette();
  const undoing = route.params?.undo === true;
  const [undoIntent] = useState(() => undoing ? preferences.get().removal : null);
  const replacement = route.params?.replacement ?? (undoIntent === removal ? undoIntent?.card : undefined);
  useEffect(() => {
    if (undoIntent) return () => preferences.cancelUndo(undoIntent);
  }, [preferences, undoIntent]);
  const replacing = Boolean(route.params?.replacement || undoing);
  const [dragging, setDragging] = useState<{ from: string; to: string; dy: number }>();
  const positions = useRef(new Map<string, { y: number; height: number }>());
  const undo = () => {
    const result = preferences.undo();
    if (result === 'full') navigation.push('Manage', { undo: true });
    if (result === 'expired') AccessibilityInfo.announceForAccessibility('Undo has expired');
  };
  const confirm = (card: Selection) => {
    if (!replacement) return;
    Alert.alert('Replace this platform?', `Replace ${identity(card)} with ${identity(replacement)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => {
        const key = selectionKey(card);
        const success = undoing ? Boolean(undoIntent && preferences.undo(key, undoIntent) === 'restored') : preferences.replace(key, replacement);
        if (success) navigation.popToTop();
        else Alert.alert('The saved platforms changed', 'Return to the platform board or manage your current selections.');
      } },
    ]);
  };
  const move = (key: string, delta: number) => {
    const current = preferences.get().cards;
    const index = current.findIndex(card => selectionKey(card) === key);
    const target = index >= 0 ? current[index + delta] : undefined;
    if (target) {
      preferences.move(key, selectionKey(target));
      AccessibilityInfo.announceForAccessibility(`Moved to position ${index + delta + 1}`);
    }
  };
  return <Surface title={replacing ? 'Replace a platform' : 'Manage platforms'} onBack={navigation.goBack}
    scrollEnabled={!dragging}>
    <Label tone="dim" style={textInset}>
      {replacement ? `Choose the saved platform to replace with ${identity(replacement)}.`
        : undoing ? 'Undo has expired.' : 'Drag the handle to reorder. Tap a card to customise its display.'}
    </Label>
    {!replacing && cards.length === 0 && <Label tone="dim" style={textInset}>No platforms saved yet.</Label>}
    <View>
      {(!replacing || replacement) && cards.map((card, index) => {
        const key = selectionKey(card);
        const detail = platformName(card);
        return <View key={key} onLayout={event => {
          const { y, height } = event.nativeEvent.layout;
          positions.current.set(key, { y, height });
        }} style={[ui.row, {
          gap: 6, marginBottom: 8, borderTopWidth: 2, borderRadius: 12,
          borderTopColor: dragging?.to === key && dragging.from !== key ? colors.selected : 'transparent',
          backgroundColor: colors.surface,
          transform: [{ translateY: dragging?.from === key ? dragging.dy : 0 }],
          zIndex: dragging?.from === key ? 1 : 0,
          ...(dragging?.from === key && { boxShadow: '0 4px 12px #00000033' }),
        }]}>
          {!replacing && <ReorderHandle label={identity(card)} first={index === 0} last={index === cards.length - 1}
            move={delta => move(key, delta)} drag={(dy, done, cancelled) => {
              if (cancelled) {
                setDragging(undefined);
                return;
              }
              const start = positions.current.get(key);
              if (!start) {
                setDragging(undefined);
                return;
              }
              const point = start.y + start.height / 2 + dy;
              let closest = key;
              let distance = Infinity;
              for (const item of cards) {
                const candidate = selectionKey(item);
                const frame = positions.current.get(candidate);
                if (!frame) continue;
                const offset = Math.abs(frame.y + frame.height / 2 - point);
                if (offset < distance) {
                  distance = offset;
                  closest = candidate;
                }
              }
              if (done) {
                setDragging(undefined);
                if (closest !== key) {
                  preferences.move(key, closest);
                  AccessibilityInfo.announceForAccessibility(`Moved to position ${cards.findIndex(item => selectionKey(item) === closest) + 1}`);
                }
              } else setDragging({ from: key, to: closest, dy });
            }} />}
          <View style={ui.flex}>
            <Result title={name(card)} detail={detail} onPress={() =>
              replacing ? confirm(card) : navigation.navigate('CardDisplay', { cardKey: key })} />
          </View>
          {!replacing && <IconButton icon="trash" label={'Remove ' + identity(card)} size={18} tone="danger"
            onPress={() => preferences.remove(key)} />}
        </View>;
      })}
    </View>
    <View style={ui.wrap}>
      {!replacing && removal && <Action onPress={undo}>Undo removal</Action>}
      <Action onPress={navigation.goBack} primary>{replacing ? 'Cancel' : 'Done'}</Action>
    </View>
  </Surface>;
}

/** Opens appearance and saved-card settings. */
export function SettingsScreen({ navigation }: Screen<'Settings'>) {
  const { preferences } = useRuntime();
  const { ready } = usePreferences();
  const colors = usePalette();
  return <Surface title="Settings" onBack={navigation.goBack}>
    <Label tone="dim" style={[textInset, { marginTop: 4 }]}>
      Choose how NextBranch looks and manage your saved platforms.
    </Label>
    <View style={[ui.row, { minHeight: 44, gap: 12, paddingHorizontal: 14, paddingVertical: 10,
      marginBottom: 8, borderRadius: 12, backgroundColor: colors.surface }]}>
      <Label style={ui.flex}>Dark Mode</Label>
      <Switch accessibilityLabel="Dark Mode" accessibilityRole="switch" disabled={!ready}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        value={colors.bg === paletteFor(false).bg}
        onValueChange={enabled => preferences.setInterfaceTheme(enabled ? 'dark' : 'light')}
        trackColor={{ true: colors.selected }} />
    </View>
    <Result title="Appearance" detail="Card display styles" onPress={() => navigation.navigate('Appearance')} />
    <Result title="Manage cards" detail="Customise, reorder or remove platforms" onPress={() => navigation.navigate('Manage')} />
  </Surface>;
}

const displayOptions = [
  ['amber', 'Amber', 'Classic dot-matrix departures'],
  ['modern', 'Modern', 'Clean, blue departure display'],
] as const satisfies readonly (readonly [Style, string, string])[];
const modes: readonly (readonly [Mode, string, string])[] = [
  ['custom', 'Custom for each card', 'Choose a style in Manage cards'],
  ...displayOptions.map(([value, title, detail]) => [value, title + ' for all', detail] as const),
];

/** Selects a global or per-card display mode. */
export function AppearanceScreen({ navigation }: Screen<'Appearance'>) {
  const { preferences } = useRuntime();
  const { mode } = usePreferences();
  return <Surface title="Appearance" onBack={navigation.goBack}>
    <Label tone="dim" size={15} accessibilityRole="header"
      style={{ marginHorizontal: 4, marginTop: 7, marginBottom: 8 }}>Card display</Label>
    <Label tone="dim" style={textInset}>Choose one style for every card, or customise each card individually.</Label>
    {modes.map(([value, title, detail]) => <Result key={value} title={title} detail={detail}
      selected={mode === value} onPress={() => preferences.setMode(value)} />)}
    {mode === 'custom' && <View style={{ marginTop: 7 }}>
      <Action onPress={() => navigation.navigate('Manage')}>Manage card styles</Action>
    </View>}
  </Surface>;
}

/** Edits the selected card’s persistent display override. */
export function CardDisplayScreen({ navigation, route }: Screen<'CardDisplay'>) {
  const { preferences } = useRuntime();
  const { cards } = usePreferences();
  const { cardKey } = route.params;
  const card = cards.find(item => selectionKey(item) === cardKey);
  return <Surface title="Card display" onBack={navigation.goBack}>
    {card ? <>
      <View style={[textInset, { marginTop: 4, gap: 4 }]}>
        <Label size={20} bold accessibilityRole="header">{name(card)}</Label>
        <Label size={15} tone="dim">{platformName(card)}</Label>
      </View>
      <Label tone="dim" style={{ marginBottom: 10 }}>
        Choose a display for this card. Selecting a style switches card display to Custom.
      </Label>
      {displayOptions.map(([value, title, detail]) => <Result key={value} title={title} detail={detail}
        selected={(card.style ?? 'amber') === value} onPress={() => preferences.setStyle(cardKey, value)} />)}
    </> : <Label tone="dim" style={{ marginBottom: 10 }}>This platform is no longer saved.</Label>}
    <View style={{ marginTop: 16 }}><Action primary onPress={navigation.goBack}>Done</Action></View>
  </Surface>;
}
