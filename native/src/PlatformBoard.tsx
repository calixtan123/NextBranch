import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, Path, Pattern, Rect } from 'react-native-svg';
import { byId } from '../../src/lib/northern/stations';
import type { AppStation } from '../../src/lib/catalogue';
import { serviceCapability } from '../../src/lib/catalogue/capability';
import { londonTime } from '../../src/lib/northern/time';
import {
  boardRows, glyphAdvance, glyphHeight, layoutFor, matrixDotSize, matrixDotStep, matrixWidth, unassignedCount, wrapMatrix,
} from './board-model';
import type { Selection } from './catalogue';
import { glyphs } from './glyphs';
import type { Style } from './preferences';
import { isStale, type createStationOwner } from './station-owner';
import { Action, Label, LineMarker, ui, usePalette } from './theme';

const amber = { background: '#0C0C09', dot: '#30281B', frame: '#3D2E14', rule: '#251F15', text: '#FFAA25', step: 6 };
const modern = { background: '#080C10', dot: '#29303B', frame: '#1B3444', rule: '#4F9BBB', text: '#BDEBFF', step: 7 };
const glowBlur = 1.25;
const glowPadding = 4;
const dotRadius = matrixDotSize * .3;
const dotEdge = matrixDotSize - 2 * dotRadius;
const emptyCopy = 'No departures currently assigned to this platform';
type Row = ReturnType<typeof boardRows>[number];
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
  return [String(index + 1), row.destination, row.branch, row.countdown,
    expanded ? `Expected at ${londonTime(row.expectedArrival)} London time` : null].filter(Boolean).join(', ');
}

function TrainRow({ row, index, style, width, expanded, last, lineName }: {
  row: Row; index: number; style: Style; width: number; expanded: boolean; last: boolean; lineName?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const isAmber = style === 'amber';
  const board = isAmber ? amber : modern;
  const text = [lineName, row.destination, row.branch].filter(Boolean).join(' ');
  const matrix = layoutFor(style, fontScale, text) === 'matrix' && width > 0;
  const scale = text.length > 28 ? .61 : text.length > 22 ? .68 : .78;
  const gap = isAmber ? 5 : 7;
  const ordinalWidth = isAmber ? 16 : 20;
  const timeWidth = isAmber ? 62 : 73;
  const countdown = !isAmber && !['Due', '1 min'].includes(row.countdown)
    ? row.countdown + 's' : row.countdown;
  const stacked = fontScale > 1.35;
  const font = isAmber ? 'Avenir Next' : 'GillSans-Light';
  return <View accessible accessibilityLabel={[lineName, rowLabel(row, index, expanded)].filter(Boolean).join(', ')}
    style={[ui.row, {
      minHeight: 37, paddingVertical: 3, gap, alignItems: stacked ? 'flex-start' : 'center',
      borderBottomWidth: last ? 0 : 1, borderBottomColor: board.rule,
    }]}>
    <View style={{ width: stacked ? undefined : ordinalWidth }}>
      {matrix ? <Led value={String(index + 1)} scale={.81} /> :
        <Text style={{ color: isAmber ? board.text : '#B6E5FF', fontFamily: font, fontSize: 16 }}>{index + 1}.</Text>}
    </View>
    <View style={[ui.flex, { gap: stacked ? 3 : 1 }]}>
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

function freshness(state: LiveState, now: number, online: boolean, limited: boolean) {
  if (!online) return state.snapshot ? 'Offline · Predictions may be outdated' : 'Offline · Connect to see live departures';
  if (state.error === 'invalid') return 'Station unavailable · Review your selection';
  if (state.error === 'configuration') return 'Live departures are unavailable';
  if (isStale(state, now, online)) return 'Predictions may be outdated';
  if (limited && !state.pending) return 'Too many requests · Try again shortly';
  if (state.error === 'timeout') return 'Departures took too long to load';
  if (state.error) return 'Departures unavailable';
  if (!state.snapshot) return 'Loading departures…';
  const age = Math.max(0, Math.floor((now - Date.parse(state.snapshot.observedAt)) / 1_000));
  return age < 5 ? 'Updated just now' : `Updated ${age} seconds ago`;
}

/** Formats a catalogue selection independently of feed content. */
export const platformName = (selection: Selection) => `${selection.direction || 'Direction unavailable'} · ${selection.platform ? 'Platform ' + selection.platform : 'Platform number not published'}`;

/** Shared Home and detail board, including stale or partial matching snapshots. */
export function PlatformBoard({ selection, style, state, now, online, limited, expanded = false, onOpen, onRetry, onReview, station }: {
  selection: Selection; style: Style; state: LiveState; now: number; online: boolean; limited: boolean; expanded?: boolean;
  onOpen?: () => void; onRetry: () => void; onReview: () => void; station?: AppStation;
}) {
  const colors = usePalette();
  const { fontScale } = useWindowDimensions();
  const stackedHeader = fontScale > 1.35;
  const [width, setWidth] = useState(0);
  const name = station?.station_name ?? byId.get(selection.stationId)?.name ?? selection.stationId;
  const platform = station?.platforms.find(item => item.platform_id === selection.physicalPlatformId);
  const lineNames = platform ? [...new Set(platform.services.map(service => service.line_name))].join(' · ') : 'Northern line';
  const details = platform?.services.map(service => {
    const capability = serviceCapability(station!, platform, service);
    const coverage = capability.feed === 'supported' && capability.mapping === 'supported' ? 'Live departures available' :
      capability.feed === 'unsupported' ? 'Live departures unsupported' : 'Live departures or platform matching await verification';
    return `${service.line_name} · ${service.direction_towards ? 'Towards ' + service.direction_towards : 'Towards not published'} · ${coverage}`;
  }).join('\n');
  const rows = boardRows(state.snapshot, selection, now, expanded ? 5 : 3);
  const board = style === 'amber' ? amber : modern;
  const warning = !online || Boolean(state.error) || isStale(state, now, online);
  const status = freshness(state, now, online, limited);
  const emptyStatus = isStale(state, now, online) ? 'No recent departures available' : emptyCopy;
  const count = rows.length + (rows.length === 1 ? ' upcoming train' : ' upcoming trains');
  const unknown = expanded ? unassignedCount(state.snapshot, now) : 0;
  const content = <>
    <View style={[ui.row, {
      minHeight: 43, paddingLeft: 12, paddingRight: 10, justifyContent: 'space-between', gap: 8,
      ...(stackedHeader && { flexDirection: 'column', alignItems: 'stretch', paddingBottom: 6 }),
    }]}>
      <View style={[!stackedHeader && ui.flex, { paddingVertical: 6, gap: 1 }]}>
        <Label size={15} bold style={{ fontFamily: 'Avenir Next', letterSpacing: -.25, fontWeight: '800' }}>{name}</Label>
        <Label size={11} tone="dim" style={{ fontFamily: 'Avenir Next' }}>{platformName(selection)}</Label>
      </View>
      <View style={[ui.row, { gap: 5, maxWidth: stackedHeader ? '100%' : '38%' }]}>
        <LineMarker />
        <Label size={10} tone="dim" bold style={{ fontFamily: 'Avenir Next', fontWeight: '700', flexShrink: 1, textAlign: stackedHeader ? 'left' : 'right' }}>{lineNames}</Label>
      </View>
    </View>
    <View style={{
      backgroundColor: board.background, borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: board.frame, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 9,
    }}>
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" accessible={false}>
          <Defs><Pattern id="boardDots" patternUnits="userSpaceOnUse" width={board.step} height={board.step}>
            <Circle cx={board.step / 2} cy={board.step / 2} r={style === 'amber' ? .7 : 1} fill={board.dot} />
          </Pattern></Defs>
          <Rect width="100%" height="100%" fill="url(#boardDots)" />
        </Svg>
      </View>
      <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {rows.map((row, index) => <TrainRow key={row.id} row={row} index={index} style={style}
          width={width} expanded={expanded} last={index === rows.length - 1}
          lineName={row.lineId && platform && platform.services.length > 1 ? platform.services.find(service => service.line_id === row.lineId)?.line_name ?? row.lineId : undefined} />)}
        {!rows.length && <Text style={{ color: board.text, padding: 8, fontSize: 12, fontFamily: 'Avenir Next' }}>
          {state.snapshot ? emptyStatus : status}
        </Text>}
      </View>
    </View>
    <View style={[ui.wrap, { minHeight: 23, paddingHorizontal: 11, paddingVertical: 3, justifyContent: 'space-between' }]}>
      <View style={[ui.row, { gap: 4, flexShrink: 1 }]}>
        {state.pending && <ActivityIndicator size="small" color={colors.dim} />}
        <Label size={10} tone={warning ? 'warning' : 'dim'} style={{ fontFamily: 'Avenir Next', flexShrink: 1 }}>
          {warning ? '⚠ ' : state.snapshot ? '● ' : ''}{status}
          {state.pending && state.snapshot ? ' · Updating…' : ''}
        </Label>
      </View>
      {expanded && state.snapshot && <Label size={10} tone="dim" style={{ fontFamily: 'Avenir Next' }}>{count}</Label>}
    </View>
  </>;
  const description = [name, platformName(selection), lineNames, details, ...rows.map((row, index) => rowLabel(row, index, false)),
    !rows.length && state.snapshot ? emptyStatus : null, status].filter(Boolean).join('. ');
  return <View style={{
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, overflow: 'hidden', marginBottom: expanded ? 10 : 18, boxShadow: '0 2px 8px #00000020',
  }}>
    {onOpen ? <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={description}
      accessibilityHint="Opens platform departures" style={({ pressed }) => ({ opacity: pressed ? .68 : 1 })}>
      {content}
    </Pressable> : content}
    {platform && <Label size={11} tone="dim" style={{ paddingHorizontal: 11, paddingVertical: 6 }}>
      {[platform.friendly_name || 'Platform description not published', details].join('\n')}
    </Label>}
    {unknown > 0 && <Label size={11} tone="dim" style={{ fontFamily: 'Avenir Next', paddingHorizontal: 11, paddingVertical: 6 }}>
      {unknown === 1 ? '1 prediction has' : `${unknown} predictions have`} no confirmed platform or direction.
    </Label>}
    {online && state.error && state.error !== 'configuration' && <View style={{ paddingHorizontal: 11, paddingBottom: 7 }}>
      {state.error === 'invalid' ? <Action onPress={onReview}>Review selection</Action> :
        <Action onPress={onRetry} disabled={state.pending || limited}>Retry</Action>}
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
