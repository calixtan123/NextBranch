/** Shared wrapping, readable line identities on native interface surfaces. */
import { View, type StyleProp, type TextStyle } from 'react-native';
import { Label, LineMarker, ui } from './theme';
import type { LineLabel } from './line-presentation';

/** Displays every line with a decorative swatch and theme foreground label. */
export function LineLabels({ lines, size = 15, heading = false, textStyle, align = 'left' }: {
  lines: readonly LineLabel[]; size?: number; heading?: boolean; textStyle?: StyleProp<TextStyle>; align?: 'left' | 'right';
}) {
  return <View accessible={heading} accessibilityRole={heading ? 'header' : undefined}
    accessibilityLabel={heading ? lines.map(line => line.name).join(' · ') : undefined}
    style={[ui.wrap, {
      flexShrink: 1, minWidth: 0,
      ...(align === 'right' && { flexDirection: 'column', alignItems: 'flex-end' }),
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
    }]}>
    {lines.map(line => <View key={line.id} style={[ui.row, { gap: 5, flexShrink: 1, minWidth: 0 }]}>
      <LineMarker lineId={line.id} />
      <Label size={size} bold style={[{ flexShrink: 1, textAlign: align }, textStyle]}>{line.name}</Label>
    </View>)}
  </View>;
}
