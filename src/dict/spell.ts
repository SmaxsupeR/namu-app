// Spelling check for imported words against the bundled dictionary: a word that is not in
// the dictionary gets close dictionary words as suggestions (one syllable changed, added or
// removed, ranked by how many jamo differ). Only a warning: learners may add words the
// dictionary does not have.
import type { Db } from '../db/schema';

const L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const T = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/** Hangul syllables → jamo letters (other characters kept), so 학교 and 학고 differ by one. */
export function jamo(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out.push(L[Math.floor(i / 588)], V[Math.floor((i % 588) / 28)]);
      if (i % 28) out.push(T[i % 28]);
    } else out.push(ch);
  }
  return out;
}

export function jamoDistance(a: string, b: string): number {
  const x = jamo(a);
  const y = jamo(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** The form looked up: without the ~ or - that mark endings and particles. */
export function spellKey(word: string): string {
  return word.normalize('NFC').trim().replace(/^[~∼-]+|[~∼-]+$/g, '');
}

/** Words worth checking: one Hangul word (no spaces, no Latin letters or digits). */
export function checkable(word: string): boolean {
  return /^[가-힣]{1,8}$/.test(spellKey(word));
}

export interface SpellResult {
  known: boolean;
  /** Close dictionary words, best first (empty when known). */
  suggestions: string[];
}

const ESCAPE = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

/**
 * Checks words against the dictionary. Unknown words get up to 3 suggestions within 2 jamo:
 * one syllable different, one syllable missing or one extra.
 */
export async function checkSpelling(db: Db, words: string[], limit = 200): Promise<Map<string, SpellResult>> {
  const out = new Map<string, SpellResult>();
  const unique = [...new Set(words.filter(checkable).map(spellKey))].slice(0, limit);
  for (const w of unique) {
    const hit = await db.getFirstAsync<{ x: number }>('SELECT 1 AS x FROM words WHERE word = ? LIMIT 1', [w]);
    if (hit) {
      out.set(w, { known: true, suggestions: [] });
      continue;
    }
    const chars = [...w];
    const patterns: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      patterns.push(ESCAPE(chars.slice(0, i).join('')) + '_' + ESCAPE(chars.slice(i + 1).join(''))); // one syllable changed
      if (chars.length > 1) patterns.push(ESCAPE(chars.slice(0, i).join('') + chars.slice(i + 1).join(''))); // one missing
    }
    for (let i = 0; i <= chars.length; i++) patterns.push(ESCAPE(chars.slice(0, i).join('')) + '_' + ESCAPE(chars.slice(i).join(''))); // one extra
    const where = patterns.map(() => "word LIKE ? ESCAPE '\\'").join(' OR ');
    const rows = await db.getAllAsync<{ word: string; level: number }>(
      `SELECT word, MIN(CASE level WHEN 0 THEN 9 ELSE level END) AS level FROM words WHERE unit = 'word' AND (${where}) GROUP BY word`,
      patterns,
    );
    const suggestions = rows
      .map((r) => ({ word: r.word, d: jamoDistance(w, r.word), level: r.level }))
      .filter((r) => r.d <= 2)
      .sort((a, b) => a.d - b.d || a.level - b.level || a.word.localeCompare(b.word))
      .slice(0, 3)
      .map((r) => r.word);
    out.set(w, { known: false, suggestions });
  }
  return out;
}
