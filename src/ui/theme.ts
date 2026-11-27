// Namu design tokens ("Calm Learning", DESIGN.md). Screens take colors, type and sizes from
// here only. Color pairs used for text were checked for WCAG AA (4.5:1) in both themes.
import { useColorScheme } from 'react-native';

const light = {
  /** Screen background. */
  bg: '#F7F9F5',
  /** Raised surfaces: sheets, list groups, inputs. */
  surface: '#FFFFFF',
  /** Pressed rows, subtle fills (segmented control track, placeholders). */
  surfaceAlt: '#EEF3EC',
  text: '#17241C',
  /** Secondary text: subtitles, hints, captions. */
  textDim: '#526459',
  border: '#CDD8CE',
  /** Hairline dividers between list rows. */
  divider: '#E2E8E1',
  primary: '#276745',
  /** Selected surface: active chip, selected row, quiet primary button. */
  primarySoft: '#E1EFE4',
  onPrimary: '#FFFFFF',
  success: '#276745',
  successSoft: '#E1EFE4',
  danger: '#B3261E',
  dangerSoft: '#F9E3E1',
  warn: '#8A5A00',
  warnSoft: '#F6ECD6',
  info: '#1F5F99',
  infoSoft: '#E2ECF6',
  /** Dims content behind sheets and dialogs. */
  scrim: 'rgba(16, 23, 19, 0.45)',
  ripple: 'rgba(23, 36, 28, 0.08)',
};

const dark: typeof light = {
  bg: '#101713',
  surface: '#1B2620',
  surfaceAlt: '#223029',
  text: '#EAF0EB',
  textDim: '#9BAEA2',
  border: '#34443A',
  divider: '#26332B',
  primary: '#82C9A0',
  primarySoft: '#233D2D',
  onPrimary: '#101713',
  success: '#82C9A0',
  successSoft: '#233D2D',
  danger: '#F2A099',
  dangerSoft: '#3B2220',
  warn: '#E3B964',
  warnSoft: '#352C17',
  info: '#8DB8E8',
  infoSoft: '#1C2B3B',
  scrim: 'rgba(0, 0, 0, 0.6)',
  ripple: 'rgba(234, 240, 235, 0.08)',
};

export type Theme = typeof light & { dark: boolean };

const LIGHT: Theme = { ...light, dark: false };
const DARK: Theme = { ...dark, dark: true };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/** Spacing scale (dp). Screen inset is `lg`. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Corner radii: controls 12, surfaces 12–16. No pill-shaped surfaces except chips and toggles. */
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Interactive sizes (dp). Every tappable element is at least `touch` tall/wide (TalkBack, thumbs). */
export const size = { touch: 48, row: 56, icon: 22, iconSmall: 18 } as const;

/**
 * Font families. Inter (bundled, Latin + Cyrillic) carries the interface; Hangul falls back to
 * the system Korean font (Noto Sans CJK KR on Android), so Korean text needs no bundled font.
 * React Native picks the weight by family name, not by fontWeight, on Android.
 */
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

export type TypeVariant = keyof typeof type;

/** Type scale (sp, scales with the system font size). */
export const type = {
  /** Screen title. */
  title: { fontSize: 28, lineHeight: 34, fontFamily: fonts.bold },
  /** Section heading. */
  section: { fontSize: 20, lineHeight: 26, fontFamily: fonts.semibold },
  /** Row titles, emphasised body. */
  bodyStrong: { fontSize: 16, lineHeight: 22, fontFamily: fonts.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  /** Subtitles, hints. */
  secondary: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  /** Small labels: tab labels, list group captions. */
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  /** Button labels. */
  button: { fontSize: 16, lineHeight: 20, fontFamily: fonts.semibold },
  /** A Korean word in a list row. */
  korean: { fontSize: 20, lineHeight: 28, fontFamily: fonts.semibold },
  /** The Korean word an exercise asks about. */
  koreanPrompt: { fontSize: 40, lineHeight: 52, fontFamily: fonts.bold },
} as const;

/** Text style for a family chosen by weight (screens may still say fontWeight: '600'). */
export function familyForWeight(weight: string | number | undefined): string {
  const w = Number(weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : weight);
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semibold;
  if (w >= 500) return fonts.medium;
  return fonts.regular;
}
