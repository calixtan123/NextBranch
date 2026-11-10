/** Native glass presentation for the Home actions and station search field. */
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { Style } from './preferences';
import { Icon, Label, paletteFor, ui, usePalette, type IconName } from './theme';

/** Keeps content readable until transparency permission is known, including later changes. */
export function GlassSurface({ accent, children, style }: {
  accent: Style; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const colors = usePalette();
  const dark = colors.bg === paletteFor(false).bg;
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', enabled => {
      changed = true;
      if (active) setReduceTransparency(enabled);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(enabled => {
      if (active && !changed) setReduceTransparency(enabled);
    }).catch(() => {
      // Keep the opaque fallback if the accessibility setting cannot be read.
    });
    return () => { active = false; subscription.remove(); };
  }, []);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable() && !reduceTransparency;
  const amber = accent === 'amber';
  const rim = dark ? (amber ? '#887044' : '#4C7588') : (amber ? '#B59A6C' : '#8BA9B7');
  const tint = dark ? (amber ? '#B58A3824' : '#7ABBD124') : (amber ? '#C7A86A18' : '#88B6CC18');
  return <View style={[{
    borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: rim,
    backgroundColor: glass ? 'transparent' : colors.input,
  }, style]}>
    {glass && <GlassView glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} tintColor={tint}
      isInteractive={false} pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill} />}
    {children}
  </View>;
}

/** A neutral-foreground glass action retaining the native button and touch target. */
export function GlassAction({ label, icon, accent, onPress, disabled }: {
  label: string; icon?: IconName; accent: Style; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{
      minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1,
      justifyContent: 'center', opacity: pressed || disabled ? .55 : 1,
    }]}>
    <GlassSurface accent={accent} style={[ui.row, {
      minHeight: 44, minWidth: 44, maxWidth: '100%', justifyContent: 'center', gap: 7,
      paddingHorizontal: icon === 'search' ? 11 : 12, paddingVertical: 9,
    }]}>
      {icon && <Icon name={icon} size={icon === 'search' ? 21 : 17} tone="fg" />}
      {icon !== 'search' && <Label size={15} tone="fg" style={{ flexShrink: 1, minWidth: 0 }}>{label}</Label>}
    </GlassSurface>
  </Pressable>;
}
