// Finds out from the dictionary whether a word is a verb or an adjective,
// and whether it is "noun + 하다" (for 공부 안 해요).
import type { Db } from '../db/schema';
import type { WordKind } from './conjugate';

export async function kindOf(db: Db, word: string): Promise<{ kind: WordKind | null; nounHada: boolean }> {
  const rows = await db.getAllAsync<{ pos: string }>('SELECT pos FROM words WHERE word = ? ORDER BY CASE WHEN level = 0 THEN 9 ELSE level END', [word]);
  const pos = rows.map((r) => r.pos);
  const kind: WordKind | null = pos.includes('동사') || pos.includes('보조 동사') ? 'verb' : pos.includes('형용사') || pos.includes('보조 형용사') ? 'adjective' : null;
  let nounHada = false;
  if (kind === 'verb' && word.endsWith('하다') && word.length > 3) {
    const noun = word.slice(0, -2);
    nounHada = (await db.getFirstAsync('SELECT 1 AS x FROM words WHERE word = ? AND pos = ?', [noun, '명사'])) !== null;
  }
  return { kind, nounHada };
}
