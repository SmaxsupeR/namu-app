// Search in the offline Korean–Russian dictionary (assets/dict/krdict.db,
// built by scripts/build-dictionary.py from 한국어기초사전, CC BY-SA 2.0 KR).
import type { Db } from '../db/schema';

export interface DictSense {
  id: number;
  n: number;
  ru: string;
  ruDef: string | null;
  koDef: string | null;
  example: string | null;
  /** This sense matched a Russian query. */
  matched: boolean;
}

export interface DictWord {
  id: number;
  word: string;
  hom: number;
  unit: 'word' | 'phrase' | 'idiom' | 'proverb' | 'grammar';
  pos: string;
  /** 1 beginner, 2 intermediate, 3 advanced, 0 not graded. */
  level: number;
  origin: string | null;
  pron: string | null;
  senses: DictSense[];
}

export type QueryKind = 'korean' | 'russian' | 'none';

export function queryKind(q: string): QueryKind {
  if (/[가-힣ᄀ-ᇿ㄰-㆏]/.test(q)) return 'korean';
  if (/[а-яё]/i.test(q)) return 'russian';
  return 'none';
}

/** Same normalization as the build script uses for Russian terms. */
export function ruKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Part of speech in Russian (the dictionary stores Korean names). */
export const POS_RU: Record<string, string> = {
  명사: 'существительное',
  동사: 'глагол',
  형용사: 'прилагательное',
  부사: 'наречие',
  관형사: 'определитель',
  대명사: 'местоимение',
  수사: 'числительное',
  감탄사: 'междометие',
  조사: 'частица',
  '의존 명사': 'служебное существительное',
  '보조 동사': 'вспомогательный глагол',
  '보조 형용사': 'вспомогательное прилагательное',
  어미: 'окончание',
  접사: 'аффикс',
};

const MAX = 30;
// Graded learner words first (beginner → advanced), then the rest; shorter headwords first.
const ORDER = 'CASE WHEN w.level = 0 THEN 9 ELSE w.level END, length(w.word), w.word, w.hom';

interface WordRow {
  id: number;
  word: string;
  hom: number;
  unit: DictWord['unit'];
  pos: string;
  level: number;
  origin: string | null;
  pron: string | null;
}

async function withSenses(db: Db, rows: WordRow[], matched: Set<number> = new Set()): Promise<DictWord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const senses = await db.getAllAsync<{
    id: number;
    word_id: number;
    n: number;
    ru: string;
    ru_def: string | null;
    ko_def: string | null;
    example: string | null;
  }>(`SELECT id, word_id, n, ru, ru_def, ko_def, example FROM senses WHERE word_id IN (${ids.map(() => '?').join(',')}) ORDER BY word_id, n`, ids);
  const by = new Map<number, DictSense[]>();
  for (const s of senses) {
    const list = by.get(s.word_id) ?? [];
    list.push({
      id: s.id,
      n: s.n,
      ru: s.ru,
      ruDef: s.ru_def,
      koDef: s.ko_def,
      example: s.example,
      matched: matched.has(s.id),
    });
    by.set(s.word_id, list);
  }
  return rows.map((r) => ({ ...r, senses: by.get(r.id) ?? [] }));
}

const WORD_COLS = 'w.id, w.word, w.hom, w.unit, w.pos, w.level, w.origin, w.pron';

/**
 * Korean search: the exact headword first, then the word with 다 added
 * (typing the stem 먹 finds 먹다), then headwords starting with the query.
 */
export async function searchKorean(db: Db, raw: string, limit = MAX): Promise<DictWord[]> {
  const q = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (q === '') return [];
  const exact = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.word IN (?, ?) ORDER BY w.word <> ?, ${ORDER}`, [q, `${q}다`, q]);
  const seen = new Set(exact.map((r) => r.id));
  const prefix = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.word > ? AND w.word < ? ORDER BY ${ORDER} LIMIT ?`, [q, `${q}￿`, limit]);
  const rows = [...exact, ...prefix.filter((r) => !seen.has(r.id))].slice(0, limit);
  return withSenses(db, rows);
}

/**
 * Russian search: equivalents equal to the query first ("школа" → 학교), then
 * equivalents containing it as a word ("старшая школа"), then prefixes ("шко…").
 */
export async function searchRussian(db: Db, raw: string, limit = MAX): Promise<DictWord[]> {
  const q = ruKey(raw);
  if (q.length < 2) return [];
  const hits = await db.getAllAsync<{
    sense_id: number;
    word_id: number;
    n: number;
    rank: number;
  }>(
    `SELECT i.sense_id, s.word_id, s.n,
            CASE WHEN i.term = ? AND i.exact = 1 THEN 0 WHEN i.term = ? THEN 1 ELSE 2 END AS rank
     FROM ru_index i JOIN senses s ON s.id = i.sense_id
     WHERE i.term >= ? AND i.term < ?
     LIMIT 400`,
    [q, q, q, `${q}￿`],
  );
  if (hits.length === 0) return [];
  const best = new Map<number, number>();
  // Which sense matched first (a word whose main sense matches ranks higher) and how many matched.
  const firstSense = new Map<number, number>();
  const count = new Map<number, number>();
  const matched = new Set<number>();
  for (const h of hits) {
    best.set(h.word_id, Math.min(best.get(h.word_id) ?? 9, h.rank));
    firstSense.set(h.word_id, Math.min(firstSense.get(h.word_id) ?? 99, h.n));
    count.set(h.word_id, (count.get(h.word_id) ?? 0) + 1);
    matched.add(h.sense_id);
  }
  const ids = [...best.keys()];
  const rows = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.id IN (${ids.map(() => '?').join(',')})`, ids);
  const level = (r: WordRow) => (r.level === 0 ? 9 : r.level);
  // Plain words before idioms and proverbs, then by match quality and level.
  const unitRank = (r: WordRow) => (r.unit === 'word' ? 0 : 1);
  rows.sort(
    (a, b) =>
      unitRank(a) - unitRank(b) ||
      best.get(a.id)! - best.get(b.id)! ||
      level(a) - level(b) ||
      firstSense.get(a.id)! - firstSense.get(b.id)! ||
      count.get(b.id)! - count.get(a.id)! ||
      a.word.length - b.word.length ||
      a.word.localeCompare(b.word),
  );
  return withSenses(db, rows.slice(0, limit), matched);
}

export function search(db: Db, q: string, limit = MAX): Promise<DictWord[]> {
  const kind = queryKind(q);
  if (kind === 'korean') return searchKorean(db, q, limit);
  if (kind === 'russian') return searchRussian(db, q, limit);
  return Promise.resolve([]);
}

/** Translation text for the chosen senses, e.g. "школа; учебное заведение". */
export function translationOf(senses: DictSense[]): string {
  const parts: string[] = [];
  for (const s of senses) {
    for (const p of s.ru.split(';')) {
      const v = p.replace(/\(досл\.\)/g, '').trim();
      if (v && !parts.includes(v)) parts.push(v);
    }
  }
  return parts.join('; ');
}

export const DICT_ATTRIBUTION = '한국어기초사전 (krdict.korean.go.kr), National Institute of Korean Language, CC BY-SA 2.0 KR';
