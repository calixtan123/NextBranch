/** Offline full-catalogue search and physical-platform inspection for native users. */
import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { byId, searchStations } from '../../src/lib/northern/stations';
import type { CataloguePlatform } from '../../src/lib/catalogue/schema';
import { LineLabels } from './LineLabels';
import { lineLabels, platformLineGroups, platformPickerTitle, platformPickerDestination } from './line-presentation';
import { GlassSurface } from './GlassControls';
import { majorityStyle } from './preferences';
import { selectionKey } from './catalogue';
import { serviceCapability } from '../../src/lib/catalogue/capability';
import type { Screen } from './navigation';
import { Surface, TextAction, usePreferences, useRuntime } from './screen-context';
import { Action, Icon, IconButton, Label, Result, ui, usePalette } from './theme';

/** Preserves every published line and towards description, including source blanks. */
function services(platform: CataloguePlatform): string {
  return platform.services.map(service => `${service.line_name} · ${service.direction_towards
    ? 'Towards ' + service.direction_towards : 'Towards not published'}`).join('\n');
}

/** Searches bundled canonical names and aliases and displays recent stations. */
export function SearchScreen({ navigation }: Screen<'Search'>) {
  const colors = usePalette();
  const { recent, mode, cards } = usePreferences();
  const accent = majorityStyle(mode, cards);
  const { preferences, discovery, synthetic } = useRuntime();
  const [query, setQuery] = useState('');
  const result = discovery.search(query);
  const searching = synthetic ? query.trim().length > 0 : result.state !== 'empty-query';
  const missing = !synthetic && result.state === 'missing-catalogue';
  const legacy = synthetic ? (searching ? searchStations(query) : recent.flatMap(id => byId.get(id) ?? [])) : [];
  const stations = searching ? result.stations : recent.flatMap(id => discovery.catalogue?.stationsByAnyId.get(id) ?? []);
  const rows = synthetic ? legacy.map(station => ({ id: station.id, name: station.name, lines: [{ id: 'northern', name: 'Northern line' }] }))
    : stations.map(station => ({ id: station.station_id, name: station.station_name,
      lines: lineLabels(station.platforms.flatMap(platform => platform.services)) }));
  return <Surface title="Search stations" onBack={navigation.goBack}
    headerAction={<TextAction label="Cancel" onPress={navigation.goBack} />}>
    <GlassSurface accent={accent} style={[ui.row, {
      minHeight: 48,
      paddingHorizontal: 12, gap: 9, marginBottom: 18,
    }]}>
      <Icon name="search" tone="dim" size={16} />
      <TextInput accessibilityLabel="Station name" placeholder="Station name" placeholderTextColor={colors.dim}
        value={query} onChangeText={setQuery} returnKeyType="search" autoCorrect={false}
        selectionColor={colors.fg}
        style={[ui.flex, { minHeight: 46, color: colors.fg, fontSize: 17, fontFamily: 'System' }]} />
      {query !== '' && <IconButton icon="clear" label="Clear station search" tone="dim" onPress={() => setQuery('')} />}
    </GlassSurface>
    <Label accessibilityRole="header" tone="dim" size={15} style={{ marginTop: 5, marginBottom: 9, marginHorizontal: 4 }}>
      {searching ? 'Search results' : 'Recent searches'}
    </Label>
    {!missing && rows.map(station => <Result key={station.id} title={station.name} detail="" onPress={() => {
      Keyboard.dismiss();
      preferences.selectStation(station.id);
      navigation.navigate('Picker', { stationId: station.id });
    }}><LineLabels lines={station.lines} /></Result>)}
    {missing ? <Label tone="dim" accessibilityRole="alert">
      Station catalogue is unavailable. Close and reopen the app to retry. If this continues, update or reinstall the app.
    </Label> : !rows.length && <Label tone="dim">
      {searching ? 'No stations found. Try another search.' : 'Your two most recent searches will appear here.'}
    </Label>}
  </Surface>;
}

/** Lists actual eligible physical platforms once with published directions and services. */
export function PickerScreen({ navigation, route }: Screen<'Picker'>) {
  const { catalogue, discovery, synthetic } = useRuntime();
  const { stationId } = route.params;
  const station = discovery.catalogue?.stationsByAnyId.get(stationId);
  const name = synthetic ? byId.get(stationId)?.name ?? stationId : station?.station_name ?? stationId;
  const platforms = synthetic ? [] : station?.platforms ?? [];
  const fixturePlatforms = synthetic ? catalogue.at(stationId) : [];
  const directions = ['Southbound', 'Northbound', 'Eastbound', 'Westbound', ''] as const;
  return <Surface title="Select platform" onBack={navigation.goBack}>
    <Label size={22} bold accessibilityRole="header" style={{ marginVertical: 5 }}>{name}</Label>
    <Label tone="dim">Select a physical platform to inspect its details.</Label>
    {platformLineGroups(platforms).map(group => <View key={group.key}>
      <View style={{ marginTop: 24, marginBottom: 8, marginHorizontal: 4 }}>
        <LineLabels lines={group.lines} heading />
      </View>
      {group.platforms.map(platform => {
        const selection = catalogue.selection?.(station!, platform);
        return <Result key={platform.platform_id}
          title={platformPickerTitle(platform.cardinal_direction, platform.platform_number)} titleEmphasis
          detail={platformPickerDestination(platform.services)}
          onPress={() => selection ? navigation.navigate('Departures', { selection })
            : navigation.navigate('PlatformDetails', { stationId: station!.station_id, platformId: platform.platform_id })} />;
      })}
    </View>)}
    {directions.map(direction => {
      const fixtures = fixturePlatforms.filter(platform => platform.direction === direction);
      return fixtures.length > 0 && <View key={direction}>
        <Label tone="dim" size={15} accessibilityRole="header"
          style={{ marginTop: 24, marginBottom: 8, marginHorizontal: 4 }}>{direction || 'Direction not published'}</Label>
        {fixtures.map(selection => <Result key={selectionKey(selection)} title={platformPickerTitle(selection.direction, selection.platform)} titleEmphasis
          detail="" onPress={() => navigation.navigate('Departures', { selection })} />)}
      </View>;
    })}
    {!platforms.length && !fixturePlatforms.length && <View style={{ marginTop: 16, gap: 12 }}>
      <Label tone="dim" accessibilityRole="alert">Platform information is unavailable for this station. Choose another station or reopen the app to retry.</Label>
      <Action onPress={() => navigation.navigate('Search')}>Search stations</Action>
    </View>}
  </Surface>;
}

/** Displays canonical browse-only platform details without claiming live or save support. */
export function PlatformDetailsScreen({ navigation, route }: Screen<'PlatformDetails'>) {
  const { discovery } = useRuntime();
  const { stationId, platformId } = route.params;
  const station = discovery.catalogue?.stationsById.get(stationId);
  const platform = station?.platforms.find(candidate => candidate.platform_id === platformId);
  return <Surface title="Platform details" onBack={navigation.goBack}>
    {platform && station ? <View style={{ gap: 12 }}>
      <Label size={22} bold accessibilityRole="header">{station.station_name}</Label>
      <Label size={19} bold>{platform.platform_number ? 'Platform ' + platform.platform_number : 'Platform number not published'}</Label>
      <Label>{platform.cardinal_direction || 'Direction unavailable'}</Label>
      <Label>{platform.friendly_name || 'Platform description not published'}</Label>
      <Label bold accessibilityRole="header">Published services</Label>
      <LineLabels lines={lineLabels(platform.services)} />
      <Label>{services(platform)}</Label>
      <Label tone="dim">{platform.services.map(service => {
        const capability = serviceCapability(station, platform, service);
        return `${service.line_name}: ${capability.feed === 'unsupported' ? 'Live departures unsupported' :
          capability.feed === 'supported' && capability.mapping === 'supported' ? 'Live departures available' :
          capability.feed === 'supported' ? 'Platform matching awaits verification' : 'Live feed and platform matching await verification'}`;
      }).join('\n')}
Live departures and saving are unavailable for this platform in this version.</Label>
    </View> : <View style={{ gap: 12 }}>
      <Label tone="dim" accessibilityRole="alert">Platform information is unavailable. Search for the station again or reopen the app to retry.</Label>
      <Action onPress={() => navigation.navigate('Search')}>Search stations</Action>
    </View>}
  </Surface>;
}
