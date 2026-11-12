/** Saved and expanded physical-platform boards with live arrival and coverage state. */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, Path, Pattern, Rect } from 'react-native-svg';
import { byId } from '../../src/lib/northern/stations';
import type { AppStation } from '../../src/lib/catalogue';
import { serviceCapability } from '../../src/lib/catalogue/capability';
import { londonTime } from '../../src/lib/northern/time';
import {
  boardRows, boardStatus, departureIdentity, glyphAdvance, glyphHeight, layoutFor, matrixDotSize, matrixDotStep, matrixWidth, unassignedCount, wrapMatrix,
} from './board-model';
import type { Selection } from './catalogue';
import { LineLabels } from './LineLabels';
import { lineLabels, platformPickerTitle } from './line-presentation';
import { glyphs } from './glyphs';
import type { Style } from './preferences';
import { isStale, type createStationOwner } from './station-owner';
import { Action, Label, ui, usePalette } from './theme';

const amber = { background: '#0C0C09', dot: '#30281B', frame: '#3D2E14', rule: '#251F15', text: '#FFAA25', step: 6 };
const modern = { background: '#080C10', dot: '#29303B', frame: '#1B3444', rule: '#4F9BBB', text: '#BDEBFF', step: 7 };
const glowBlur = 1.25;
const glowPadding = 4;
const dotRadius = matrixDotSize * .3;
const dotEdge = matrixDotSize - 2 * dotRadius;
const emptyCopy = 'No departures currently assigned to this platform';
type Row = ReturnType<typeof boardRows>[number] & { identity: string };
type LiveState = ReturnType<ReturnType<typeof createStationOwner>['get']>;

function roundedDot(x: number, y: number) {
  return `M${x + dotRadius},${y}h${dotEdge}q${dotRadius},0 ${dotRadius},${dotRadius}` +
    `v${dotEdge}q0,${dotRadius} ${-dotRadius},${dotRadius}h${-dotEdge}` +
    `q${-dotRadius},0 ${-dotRadius},${-dotRadius}v${-dotEdge}q0,${-dotRadius} ${dotRadius},${-dotRadius}z`;
}

const Led = memo(function Led({ value, scale }: { value: string; scale: number }) {
  let on = '';
  let off = '';
  [...value.toUpperCase()].forEach((character, index) => {
    const glyph = glyphs[character] ?? glyphs[' '];
    glyph.forEach((line, row) => [...line].forEach((bit, column) => {
      const path = roundedDot(index * glyphAdvance + column * matrixDotStep, row * matrixDotStep);
      if (bit === '1') on += path;
      else off += path;
    }));
  });
  // Give the halo room inside the SVG viewport without increasing the layout footprint.
  const pad = glowPadding / scale;
  const width = matrixWidth(value, 1) + 2 * pad;
  const height = glyphHeight + 2 * pad;
  // Svg truncates numeric dimensions. Size the native view in fractional points instead.
  return <View pointerEvents="none" style={{
    width: matrixWidth(value, scale) + 2 * glowPadding,
    height: glyphHeight * scale + 2 * glowPadding,
    margin: -glowPadding,
  }}>
    <Svg width="100%" height="100%" viewBox={`${-pad} ${-pad} ${width} ${height}`} accessible={false}>
      <Defs>
        <Filter id="ledGlow" filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={width} height={height}>
          <FeGaussianBlur stdDeviation={glowBlur} />
        </Filter>
      </Defs>
      <Path d={off} fill="#211B10" opacity={0.58} />
      <Path d={on} fill="#FF7B00B8" filter="url(#ledGlow)" />
      <Path d={on} fill={amber.text} />
    </Svg>
  </View>;
});

function rowLabel(row: Row, index: number, expanded: boolean) {
  return [String(index + 1), row.identity, row.countdown,
    expanded ? `Expected at ${londonTime(row.expectedArrival)} London time` : null].filter(Boolean).join(', ');
}

function TrainRow({ row, index, style, width, expanded, last }: {
  row: Row; index: number; style: Style; width: number; expanded: boolean; last: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const isAmber = style === 'amber';
  const board = isAmber ? amber : modern;
  const text = row.identity;
  const matrix = layoutFor(style, fontScale, text) === 'matrix' && width > 0;
  const scale = .85;
  const gap = isAmber ? 5 : 7;
  const ordinalWidth = isAmber ? 16 : 20;
  const timeWidth = isAmber ? 62 : 73;
  const countdown = !isAmber && !['Due', '1 min'].includes(row.countdown)
    ? row.countdown + 's' : row.countdown;
  const stacked = fontScale > 1.35;
  const font = isAmber ? 'Avenir Next' : 'GillSans-Light';
  return <View accessible accessibilityLabel={rowLabel(row, index, expanded)}
    style={[ui.row, {
      minHeight: 37, paddingVertical: 3, gap, alignItems: stacked ? 'flex-start' : 'center',
      borderBottomWidth: last ? 0 : 1, borderBottomColor: board.rule,
    }]}>
    <View style={{ width: stacked ? undefined : ordinalWidth }}>
      {matrix ? <Led value={String(index + 1)} scale={.81} /> :
        <Text style={{ color: isAmber ? board.text : '#B6E5FF', fontFamily: font, fontSize: 16 }}>{index + 1}.</Text>}
    </View>
    <View style={[ui.flex, { alignItems: 'flex-start', gap: matrix ? 6 : stacked ? 3 : 1 }]}>
      {matrix ? wrapMatrix(text, width - ordinalWidth - timeWidth - 2 * gap, scale)
        .map((line, part) => <Led key={part} value={line} scale={scale} />)
        : <Text style={[!isAmber && styles.modernGlow,
          { color: board.text, fontFamily: font, fontSize: isAmber ? 13 : 17, letterSpacing: .05 }]}>{text}</Text>}
      {stacked && <Text style={[!isAmber && styles.modernGlow, { color: board.text, fontFamily: font, fontSize: 14 }]}>
        {countdown}{expanded && ' · ' + londonTime(row.expectedArrival)}
      </Text>}
    </View>
    {!stacked && <View style={{ width: timeWidth, alignItems: 'flex-end' }}>
      {isAmber && fontScale <= 1.15 ? <View style={[ui.row, { gap: 4 }]}>
        {countdown.split(' ').map(part => <Led key={part} value={part} scale={.78} />)}
      </View> : <Text style={[!isAmber && styles.modernGlow,
        { color: board.text, fontFamily: font, fontSize: isAmber ? 13 : 18, textAlign: 'right' }]}>
        {countdown}
      </Text>}
      {expanded && <Text style={{ color: board.text, fontFamily: 'Avenir Next', fontSize: 10, opacity: .82 }}>
        {londonTime(row.expectedArrival)}
      </Text>}
    </View>}
  </View>;
}

/** Formats a catalogue selection independently of feed content. */
export const platformName = (selection: Selection) => platformPickerTitle(selection.direction, selection.platform);

/** Shared Home and detail board, including stale or partial matching snapshots. */
export function PlatformBoard({ selection, style, state, now, online, expanded = false, onOpen, onReview, station }: {
  selection: Selection; style: Style; state: LiveState; now: number; online: boolean; limited: boolean; expanded?: boolean;
  onOpen?: () => void; onReview: () => void; station?: AppStation;
}) {
  const colors = usePalette();
  const [width, setWidth] = useState(0);
  const [surface, setSurface] = useState({ width: 0, height: 0 });
  const name = station?.station_name ?? byId.get(selection.stationId)?.name ?? selection.stationId;
  const matchingPlatforms = station?.platforms.filter(item => selection.physicalPlatformId
    ? item.platform_id === selection.physicalPlatformId
    : item.platform_number === selection.platform && item.cardinal_direction === selection.direction);
  const platform = matchingPlatforms?.length === 1 ? matchingPlatforms[0] : undefined;
  const lineNames = platform ? [...new Set(platform.services.map(service => service.line_name))].join(' · ') : 'Northern line';
  const departureCoverage = platform?.services.some(service => service.line_id === 'national-rail')
    ? 'TfL departures only' : null;
  const details = platform?.services.map(service => {
    const capability = serviceCapability(station!, platform, service);
    const feedState = state.snapshot?.catalogue?.feeds?.find(feed => feed.lineId === service.line_id && feed.stopAreaId === service.stop_area_naptan_code)?.liveState;
    const supportedCopy = feedState === 'unavailable' || state.error ? 'Live departures temporarily unavailable'
      : feedState === 'empty' ? 'No upcoming departures' : null;
    const coverage = capability.feed === 'supported' && capability.mapping === 'supported' ? supportedCopy :
      capability.feed === 'unsupported' ? 'Live departures unsupported' :
        capability.feed === 'supported' ? 'Platform matching awaits verification' : 'Live departures or platform matching await verification';
    if (!coverage) return null;
    return [service.line_name, service.direction_towards.trim() ? 'Towards ' + service.direction_towards : null, coverage]
      .filter(Boolean).join(' · ');
  });
  const caveats = [...new Set([departureCoverage, ...details ?? []].filter((detail): detail is string => Boolean(detail)))];
  const rows = boardRows(state.snapshot, selection, now, expanded ? 5 : 3)
    .map(row => ({ ...row, identity: departureIdentity(row, platform?.services) }));
  const board = style === 'amber' ? amber : modern;
  const relevantFeeds = platform?.services
    .filter(service => serviceCapability(station!, platform, service).feed === 'supported')
    .map(service => ({ lineId: service.line_id, stopAreaId: service.stop_area_naptan_code }));
  const status = boardStatus(state, now, online, relevantFeeds);
  const emptyStatus = isStale(state, now, online) ? 'No recent departures available' : emptyCopy;
  const count = rows.length + (rows.length === 1 ? ' upcoming train' : ' upcoming trains');
  const unknown = expanded ? unassignedCount(state.snapshot, now) : 0;
  const content = <>
    <View style={[ui.row, {
      minHeight: 43, paddingLeft: 12, paddingRight: 10, justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap',
    }]}>
      <View style={{ minWidth: 0, paddingVertical: 6, gap: 1, flex: 1 }}>
        <Label size={19} bold style={{ letterSpacing: -.25, fontWeight: '700' }}>{name}</Label>
        <Label size={14} tone="dim">{platformName(selection)}</Label>
      </View>
      <View style={[ui.row, { gap: 5, flexShrink: 0, maxWidth: '40%' }]}>
        <LineLabels lines={platform ? lineLabels(platform.services) : [{ id: 'northern', name: 'Northern line' }]} size={12} align="right"
          textStyle={{ fontWeight: '700' }} />
      </View>
    </View>
    <View style={{
      backgroundColor: board.background, borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: board.frame, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 9,
    }}>
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          setSurface({ width, height });
        }}>
        {/* Numeric bounds invalidate the native SVG rectangle when arrival content grows or wraps. */}
        {surface.width > 0 && surface.height > 0 && <Svg width={surface.width} height={surface.height} accessible={false}>
          <Defs><Pattern id="boardDots" patternUnits="userSpaceOnUse" width={board.step} height={board.step}>
            <Circle cx={board.step / 2} cy={board.step / 2} r={style === 'amber' ? .7 : 1} fill={board.dot} />
          </Pattern></Defs>
          <Rect width={surface.width} height={surface.height} fill="url(#boardDots)" />
        </Svg>}
      </View>
      <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {rows.map((row, index) => <TrainRow key={row.id} row={row} index={index} style={style}
          width={width} expanded={expanded} last={index === rows.length - 1} />)}
        {!rows.length && <Label size={12} style={{ color: board.text, padding: 8 }}>
          {state.snapshot ? emptyStatus : status.label}
        </Label>}
      </View>
    </View>
    <View style={[ui.wrap, { minHeight: 23, paddingHorizontal: 11, paddingVertical: 3, justifyContent: 'space-between' }]}>
      <View accessible={!onOpen} accessibilityRole="image" accessibilityLabel={status.label}
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[status.tone] }} />
      {expanded && state.snapshot && <Label size={10} tone="dim">{count}</Label>}
    </View>
    {caveats.length > 0 && <Label size={11} tone="dim" style={{ paddingHorizontal: 11, paddingVertical: 6 }}>
      {caveats.join('\n')}
    </Label>}
  </>;
  const description = [...new Set([name, platformName(selection), lineNames, ...rows.map((row, index) => rowLabel(row, index, false)),
    !rows.length && state.snapshot ? emptyStatus : null, ...caveats, status.label].filter(Boolean))].join('. ');
  return <View style={{
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, overflow: 'hidden', marginBottom: expanded ? 10 : 18, boxShadow: '0 2px 8px #00000020',
  }}>
    {onOpen ? <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={description}
      accessibilityHint="Opens platform departures" style={({ pressed }) => ({ opacity: pressed ? .68 : 1 })}>
      {content}
    </Pressable> : content}
    {unknown > 0 && <Label size={11} tone="dim" style={{ paddingHorizontal: 11, paddingVertical: 6 }}>
      {unknown === 1 ? '1 prediction has' : `${unknown} predictions have`} no confirmed platform or direction.
    </Label>}
    {online && state.error === 'invalid' && <View style={{ paddingHorizontal: 11, paddingBottom: 7 }}>
      <Action onPress={onReview}>Review selection</Action>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  modernGlow: {
    textShadowColor: '#4CB6F244',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});
