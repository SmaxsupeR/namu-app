// Size of the main Korean text of an exercise by its length (no React Native here, so it is
// testable). Words: 56 sp up to 4 syllables, then smaller down to 36 sp; text with spaces is a
// phrase or sentence: 28–36 sp. Line height leaves room for Hangul so nothing is clipped.
export interface KoreanSize {
  fontSize: number;
  lineHeight: number;
  fontWeight: '500' | '600';
}

export function koreanSize(text: string): KoreanSize {
  const t = text.trim();
  if (/\s/.test(t)) {
    const size = t.length <= 12 ? 36 : t.length <= 20 ? 32 : 28;
    return { fontSize: size, lineHeight: Math.round(size * 1.4), fontWeight: '500' };
  }
  const syllables = [...t].filter((c) => c >= '가' && c <= '힣').length || [...t].length;
  const size = syllables <= 4 ? 56 : syllables === 5 ? 50 : syllables === 6 ? 44 : syllables === 7 ? 40 : 36;
  return { fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: '600' };
}
