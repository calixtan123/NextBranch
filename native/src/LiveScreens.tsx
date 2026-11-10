import { AccessibilityInfo, View } from 'react-native';
import { byId } from '../../src/lib/northern/stations';
import { boardRows } from './board-model';
import { selectionKey } from './catalogue';
import type { Screen } from './navigation';
import { PlatformBoard, platformName } from './PlatformBoard';
import { GlassAction } from './GlassControls';
import { effectiveStyle, majorityStyle } from './preferences';
import { Surface, useBoardTime, usePreferences, useRefresh, useRuntime } from './screen-context';
import { Action, IconButton, Label, Result, ui } from './theme';

/** Displays a recoverable review entry for a previously saved, now unknown tuple. */
export function ReviewCard({ stationId, platform, onPress }: { stationId: string; platform?: string; onPress: () => void }) {
  return <Result title={byId.get(stationId)?.name ?? stationId}
    detail={platform ? `Platform ${platform} needs review. Choose a verified platform.` : 'Review platform selection'}
    onPress={onPress} />;
}

/** Shows the ordered saved platform boards and Home actions. */
export function HomeScreen({ navigation }: Screen<'Home'>) {
  const { stations, catalogue, preferences } = useRuntime();
  const { cards, mode, removal } = usePreferences();
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
  return <Surface title="NextBranch" refresh={ids.length && online && !limited ? () => void refresh(ids) : undefined}
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
    {cards.map(card => {
      const review = () => navigation.navigate('Picker', { stationId: card.stationId });
      return catalogue.has(card)
        ? <PlatformBoard key={selectionKey(card)} selection={card} style={effectiveStyle(mode, card)}
          state={stations.get(card.stationId)} now={now} online={online} limited={limited}
          onOpen={() => navigation.navigate('Departures', { selection: card })}
          onRetry={() => void refresh([card.stationId])} onReview={review} />
        : <ReviewCard key={selectionKey(card)} stationId={card.stationId} platform={card.platform} onPress={review} />;
    })}
    {!cards.length && <Label tone="dim" style={{ marginBottom: 10 }}>
      Add a Northern line platform to see its next departures here.
    </Label>}
    <View style={ui.wrap}>
      {cards.length < 3 && <GlassAction accent={accent} icon="plus" label="Add a platform" onPress={openSearch} />}
      {ids.length > 0 && <IconButton icon="refresh" label="Refresh departures" tone="dim"
        disabled={refreshing || !online || limited} onPress={() => void refresh(ids)} />}
      {removal && <Action onPress={undo}>Undo removal</Action>}
    </View>
  </Surface>;
}

/** Shows a single physical platform with its expanded board and save actions. */
export function DeparturesScreen({ navigation, route }: Screen<'Departures'>) {
  const { catalogue, preferences, stations } = useRuntime();
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
  return <Surface title="Platform departures" onBack={navigation.goBack}>
    {catalogue.has(selection) ? <>
      <Label size={11} tone="dim" style={{ marginBottom: 10 }}>
        Selected physical platform{state.snapshot ? ` · ${count} upcoming` : ''}
      </Label>
      <PlatformBoard selection={selection} style={effectiveStyle(mode, saved)} state={state} now={now}
        online={online} limited={limited} expanded onReview={review} onRetry={() => void refresh([selection.stationId])} />
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
