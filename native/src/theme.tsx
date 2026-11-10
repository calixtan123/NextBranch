/** Native theme palettes, accessible controls and shared presentation primitives. */
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { lineColour } from './line-presentation';

const dark = {
  bg: '#0B0B0D', surface: '#171719', fg: '#ECEDEF', dim: '#929398', border: '#303033',
  warning: '#F2AC48', danger: '#E98383', selected: '#0A84FF', primary: '#0066CC', input: '#252527',
};
const light = {
  bg: '#F2F2F3', surface: '#FFFFFF', fg: '#222528', dim: '#60646B', border: '#E0E0E2',
  warning: '#824A03', danger: '#A73939', selected: '#0066CC', primary: '#0066CC', input: '#E5E5EA',
};

export type Palette = typeof dark;
/** The pinned design's charcoal and paper palettes. */
export const Theme = createContext<Palette>(dark);
export const paletteFor = (lightMode: boolean) => lightMode ? light : dark;
export const usePalette = () => useContext(Theme);

export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  body: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14 },
  flex: { flex: 1, minWidth: 0 },
  button: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});

/** Scalable system text on the current interface surface. */
export function Label({ tone = 'fg', size = 15, bold, style, ...props }: TextProps & {
  tone?: keyof Palette; size?: number; bold?: boolean;
}) {
  const colors = usePalette();
  return <Text {...props} style={[{
    color: colors[tone], fontFamily: 'System', fontSize: size, fontWeight: bold ? '600' : '400',
  }, style]} />;
}

const paths = {
  search: 'M21 21l-4.35-4.35',
  back: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
  settings: 'M20 7h-9M7 7H4m16 10h-4m-4 0H4',
  grip: '',
  trash: 'M3 6h18m-2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6m3 0V3h8v3m-6 4v7m4-7v7',
  refresh: 'M20 7v5h-5M4 17v-5h5m-4.1-4a8 8 0 0 1 13-2L20 9m-16 6 2.1 3a8 8 0 0 0 13-2',
  clear: 'm18 6-12 12M6 6l12 12',
  check: 'm20 6-11 11-5-5',
  plus: 'M12 5v14M5 12h14',
};
export type IconName = keyof typeof paths;

/** Decorative outline icons following the pinned component's icon geometry. */
export function Icon({ name, size = 19, tone = 'fg' }: { name: IconName; size?: number; tone?: keyof Palette }) {
  const color = usePalette()[tone];
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={paths[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {name === 'search' && <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={2} fill="none" />}
    {name === 'settings' && <>
      <Circle cx={9} cy={7} r={2} stroke={color} strokeWidth={2} fill="none" />
      <Circle cx={14} cy={17} r={2} stroke={color} strokeWidth={2} fill="none" />
    </>}
    {name === 'grip' && [9, 15].flatMap(x => [5, 12, 19].map(y => <Circle key={x + ':' + y} cx={x} cy={y} r={1.4} fill={color} />))}
  </Svg>;
}

/** A labelled icon button with a minimum 44-point target. */
export function IconButton({ icon, label, onPress, tone = 'selected', size, disabled }: {
  icon: IconName; label: string; onPress: () => void; tone?: keyof Palette; size?: number; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [ui.button, { opacity: pressed || disabled ? 0.55 : 1 }]}>
    <Icon name={icon} size={size} tone={tone} />
  </Pressable>;
}

/** A system-blue primary or secondary action with a native touch target. */
export function Action({ children, onPress, primary, disabled }: {
  children: ReactNode; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  const colors = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [ui.button, {
      alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: primary ? colors.primary : colors.surface,
      opacity: pressed || disabled ? 0.55 : 1,
    }]}>
    <Label size={17} bold tone="selected" style={primary && { color: '#FFFFFF' }}>{children}</Label>
  </Pressable>;
}

/** A tappable list row or selected radio option. */
export function Result({ title, detail, onPress, selected, children }: {
  title: string; detail: string; onPress: () => void; selected?: boolean; children?: ReactNode;
}) {
  const colors = usePalette();
  return <Pressable accessibilityRole={selected === undefined ? 'button' : 'radio'}
    accessibilityState={selected === undefined ? undefined : { checked: selected, selected }}
    onPress={onPress} style={({ pressed }) => [ui.row, {
      minHeight: 64, backgroundColor: colors.surface, borderRadius: 12, borderBottomWidth: 1,
      borderBottomColor: colors.border, paddingVertical: 12,
      paddingHorizontal: 16, marginBottom: 8, gap: 10, opacity: pressed ? 0.65 : 1,
    }]}>
    <View style={ui.flex}>
      <Label size={17}>{title}</Label>
      {detail !== '' && <Label size={15} tone="dim" style={{ marginTop: 3 }}>{detail}</Label>}
      {children}
    </View>
    {selected === undefined ? <Icon name="next" tone="dim" size={17} /> : selected ? <Icon name="check" tone="selected" size={20} /> : null}
  </Pressable>;
}

/** Bordered colour swatch; adjacent text carries the line identity accessibly. */
export function LineMarker({ lineId }: { lineId: string }) {
  const colors = usePalette();
  return <Svg width={17} height={7} accessible={false}>
    <Rect x={0.5} y={0.5} width={16} height={6} rx={2.5} fill={lineColour(lineId)} stroke={colors.fg} />
  </Svg>;
}
