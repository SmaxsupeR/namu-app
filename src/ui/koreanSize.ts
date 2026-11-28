// Size of the main Korean text of an exercise by its length (no React Native here, so it is
// testable). Words: 56 sp up to 4 syllables, then smaller down to 36 sp; text with spaces is a
// phrase or sentence: 28–36 sp. Line height leaves room for Hangul so nothing is clipped.
// Given the available width, a single word that still would not fit on one line is made
// smaller so it stays on one line (very long compound words); phrases wrap between words.
export interface KoreanSize {
  fontSize: number;
  lineHeight: number;
  fontWeight: '500' | '600';
}

/** Hangul and other wide glyphs take about one em; Latin letters and digits about 0.6 em. */
export function textEms(text: string): number {
  let ems = 0;
  for (const c of text) ems += /[ᄀ-ᇿ㄰-㆏가-힣　-鿿]/.test(c) ? 1 : 0.6;
  return ems;
}

/** Smallest size a long word is shrunk to; below this it may wrap rather than become unreadable. */
export const KOREAN_FIT_MIN = 20;

/**
 * @param width available width in dp (unknown: no fitting)
 * @param fontScale the system font scale actually applied to this text (already capped)
 */
export function koreanSize(text: string, width?: number, fontScale = 1): KoreanSize {
  const t = text.trim();
  if (/\s/.test(t)) {
    const size = t.length <= 12 ? 36 : t.length <= 20 ? 32 : 28;
    return { fontSize: size, lineHeight: Math.round(size * 1.4), fontWeight: '500' };
  }
  const syllables = [...t].filter((c) => c >= '가' && c <= '힣').length || [...t].length;
  let size = syllables <= 4 ? 56 : syllables === 5 ? 50 : syllables === 6 ? 44 : syllables === 7 ? 40 : 36;
  if (width && width > 0) {
    // 4 % spare: glyph advances differ a little between fonts.
    const fits = Math.floor(width / (textEms(t) * 1.04 * Math.max(fontScale, 1)));
    size = Math.max(KOREAN_FIT_MIN, Math.min(size, fits));
  }
  return { fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: '600' };
}
