// The app's Text: Inter in the weight the style asks for (Android picks weights by family
// name), the theme's text color by default, and an optional type-scale variant. Hangul in the
// same string falls back to the system Korean font. Scales with the system font size.
import type { ComponentProps } from 'react';
import { Text as RNText, StyleSheet, type TextStyle } from 'react-native';
import { familyForWeight, type as typeScale, useTheme, type TypeVariant } from './theme';

export type AppTextProps = ComponentProps<typeof RNText> & { variant?: TypeVariant };

export function Text({ variant, style, ...rest }: AppTextProps) {
  const t = useTheme();
  const flat: TextStyle = StyleSheet.flatten([{ color: t.text }, variant ? typeScale[variant] : null, style]) ?? {};
  const own = typeof flat.fontFamily === 'string' && !flat.fontFamily.startsWith('Inter');
  const fontFamily = own ? flat.fontFamily : flat.fontWeight !== undefined ? familyForWeight(flat.fontWeight) : (flat.fontFamily ?? familyForWeight(undefined));
  return <RNText {...rest} style={[flat, { fontFamily, fontWeight: own ? flat.fontWeight : 'normal' }]} />;
}
