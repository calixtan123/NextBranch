import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { byId, searchStations } from '../../src/lib/northern/stations';
import { selectionKey } from './catalogue';
import type { Screen } from './navigation';
import { Surface, TextAction, usePreferences, useRuntime } from './screen-context';
import { Action, Icon, IconButton, Label, Result, ui, usePalette } from './theme';

/** Searches bundled canonical names and aliases and displays recent stations. */
export function SearchScreen({ navigation }: Screen<'Search'>) {
  const colors = usePalette();
  const { recent } = usePreferences();
  const { preferences } = useRuntime();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchStations(query) : recent.flatMap(id => byId.get(id) ?? []);
  return <Surface title="Search stations" onBack={navigation.goBack}
    headerAction={<TextAction label="Cancel" onPress={navigation.goBack} />}>
    <View style={[ui.row, {
      minHeight: 48, borderRadius: 12, backgroundColor: colors.input,
      paddingHorizontal: 12, gap: 9, marginBottom: 18,
    }]}>
      <Icon name="search" tone="dim" size={16} />
      <TextInput accessibilityLabel="Station name" placeholder="Station name" placeholderTextColor={colors.dim}
        value={query} onChangeText={setQuery} returnKeyType="search" autoCorrect={false}
        selectionColor={colors.selected}
        style={[ui.flex, { minHeight: 46, color: colors.fg, fontSize: 17, fontFamily: 'System' }]} />
      {query !== '' && <IconButton icon="clear" label="Clear station search" tone="dim" onPress={() => setQuery('')} />}
    </View>
    <Label accessibilityRole="header" tone="dim" size={15} style={{ marginTop: 5, marginBottom: 9, marginHorizontal: 4 }}>
      {searching ? 'Search results' : 'Recent searches'}
    </Label>
    {results.map(station => <Result key={station.id} title={station.name} detail="Northern line" onPress={() => {
      Keyboard.dismiss();
      preferences.selectStation(station.id);
      navigation.navigate('Picker', { stationId: station.id });
    }} />)}
    {!results.length && <Label tone="dim">
      {searching ? 'No stations found. Try another search.' : 'Your two most recent searches will appear here.'}
    </Label>}
  </Surface>;
}

/** Lists only physical platforms supplied by the catalogue. */
export function PickerScreen({ navigation, route }: Screen<'Picker'>) {
  const { catalogue } = useRuntime();
  const { stationId } = route.params;
  const name = byId.get(stationId)?.name ?? stationId;
  const platforms = catalogue.at(stationId);
  return <Surface title="Select platform" onBack={navigation.goBack}>
    <Label size={22} bold accessibilityRole="header" style={{ marginVertical: 5 }}>{name}</Label>
    <Label tone="dim">Select a physical platform and direction.</Label>
    {(['Southbound', 'Northbound'] as const).map(direction => {
      const matching = platforms.filter(platform => platform.direction === direction);
      return matching.length > 0 && <View key={direction}>
        <Label tone="dim" size={15} accessibilityRole="header"
          style={{ marginTop: 24, marginBottom: 8, marginHorizontal: 4 }}>{direction}</Label>
        {matching.map(selection => <Result key={selectionKey(selection)} title={'Platform ' + selection.platform}
          detail={selection.direction} onPress={() => navigation.navigate('Departures', { selection })} />)}
      </View>;
    })}
    {!platforms.length && <View style={{ marginTop: 16, gap: 12 }}>
      <Label tone="dim">Verified platform information is unavailable for this station. Choose another station to continue.</Label>
      <Action onPress={() => navigation.navigate('Search')}>Search stations</Action>
    </View>}
  </Surface>;
}
