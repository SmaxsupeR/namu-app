// How a dictionary headword is read aloud. Idioms carry optional parts and
// alternatives in the dictionary's notation: 비위(가) 사납다, 거리에/로 나앉다,
// 고혈을 짜다[짜내다/빨다]. The voice reads the main variant. The same function
// keys the pre-made dictionary audio, so both sides must use it.

/** Text to speak for a headword, or null if it is not speakable (lone jamo such as -ㄴ다). */
export function headwordSpeech(word: string): string | null {
  let t = word.normalize('NFC').trim();
  t = t.replace(/\[[^\]]*\]/g, ''); // alternatives in brackets: drop
  t = t.replace(/[()]/g, ''); // optional parts in parentheses: keep, without the brackets
  t = t
    .split(/\s+/)
    .map((w) => w.split('/')[0]) // A/B: the first alternative
    .join(' ');
  t = t.replace(/^[-~∼]+|[-~∼]+$/g, '').replace(/[-~∼]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!/[가-힣]/.test(t) || /[ㄱ-ㆎ]/.test(t)) return null;
  return t;
}
