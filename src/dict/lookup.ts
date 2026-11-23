// Search in the offline Korean–Russian dictionary (assets/dict/krdict.db,
// built by scripts/build-dictionary.py from 한국어기초사전, CC BY-SA 2.0 KR).
import { DICT_POS, type WordType } from '../core/wordTypes';
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
  topic: string | null;
  subject: string | null;
  senses: DictSense[];
}

/** Narrows a search or a browse. Every field is optional. */
export interface DictFilter {
  type?: WordType;
  level?: number;
  /** Top-level ("인간") or full ("인간 > 감정") topic. */
  topic?: string;
  subject?: string;
}

/** SQL condition on table alias w for a filter. */
export function filterSql(f: DictFilter = {}): { sql: string; params: (string | number)[] } {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (f.type === 'expression') parts.push("w.unit IN ('phrase', 'idiom', 'proverb')");
  else if (f.type === 'grammar') parts.push(`(w.unit = 'grammar' OR w.pos IN (${DICT_POS.grammar.map(() => '?').join(',')}))`), params.push(...DICT_POS.grammar);
  else if (f.type) {
    parts.push(`w.unit = 'word' AND w.pos IN (${DICT_POS[f.type].map(() => '?').join(',')})`);
    params.push(...DICT_POS[f.type]);
  }
  if (f.level !== undefined) {
    parts.push('w.level = ?');
    params.push(f.level);
  }
  if (f.topic) {
    parts.push('(w.topic = ? OR w.topic LIKE ?)');
    params.push(f.topic, `${f.topic} > %`);
  }
  if (f.subject) {
    parts.push('w.subject = ?');
    params.push(f.subject);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
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
/** Upper bound for prefix ranges: "학" … "학\uFFFF". */
const END = '\uFFFF';
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
  topic: string | null;
  subject: string | null;
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

const WORD_COLS = 'w.id, w.word, w.hom, w.unit, w.pos, w.level, w.origin, w.pron, w.topic, w.subject';

/**
 * Korean search: the exact headword first, then the word with 다 added
 * (typing the stem 먹 finds 먹다), then headwords starting with the query.
 */
export async function searchKorean(db: Db, raw: string, limit = MAX, filter: DictFilter = {}): Promise<DictWord[]> {
  const q = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (q === '') return [];
  const f = filterSql(filter);
  const exact = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.word IN (?, ?)${f.sql} ORDER BY w.word <> ?, ${ORDER}`, [q, `${q}다`, ...f.params, q]);
  const seen = new Set(exact.map((r) => r.id));
  const prefix = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.word > ? AND w.word < ?${f.sql} ORDER BY ${ORDER} LIMIT ?`, [q, `${q}${END}`, ...f.params, limit]);
  const rows = [...exact, ...prefix.filter((r) => !seen.has(r.id))].slice(0, limit);
  return withSenses(db, rows);
}

/**
 * Russian search: equivalents equal to the query first ("школа" → 학교), then
 * equivalents containing it as a word ("старшая школа"), then prefixes ("шко…").
 */
export async function searchRussian(db: Db, raw: string, limit = MAX, filter: DictFilter = {}): Promise<DictWord[]> {
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
     LIMIT 1000`,
    [q, q, q, `${q}${END}`],
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
  const f = filterSql(filter);
  const rows = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE w.id IN (${ids.map(() => '?').join(',')})${f.sql}`, [...ids, ...f.params]);
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

export function search(db: Db, q: string, limit = MAX, filter: DictFilter = {}): Promise<DictWord[]> {
  const kind = queryKind(q);
  if (kind === 'korean') return searchKorean(db, q, limit, filter);
  if (kind === 'russian') return searchRussian(db, q, limit, filter);
  return Promise.resolve([]);
}

/** Lists words by filter without a query: learner words first, then alphabetically. */
export async function browse(db: Db, filter: DictFilter, offset = 0, limit = MAX): Promise<DictWord[]> {
  const f = filterSql(filter);
  const rows = await db.getAllAsync<WordRow>(`SELECT ${WORD_COLS} FROM words w WHERE 1 = 1${f.sql} ORDER BY CASE WHEN w.level = 0 THEN 9 ELSE w.level END, w.word, w.hom LIMIT ? OFFSET ?`, [
    ...f.params,
    limit,
    offset,
  ]);
  return withSenses(db, rows);
}

export async function countWords(db: Db, filter: DictFilter): Promise<number> {
  const f = filterSql(filter);
  return (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM words w WHERE 1 = 1${f.sql}`, f.params))?.n ?? 0;
}

/** Topics that have words, with their counts (full names, e.g. "인간 > 감정"). */
export async function topicCounts(db: Db): Promise<{ topic: string; n: number }[]> {
  return db.getAllAsync('SELECT topic, COUNT(*) AS n FROM words WHERE topic IS NOT NULL GROUP BY topic ORDER BY topic', []);
}

export async function subjectCounts(db: Db): Promise<{ subject: string; n: number }[]> {
  return db.getAllAsync('SELECT subject, COUNT(*) AS n FROM words WHERE subject IS NOT NULL GROUP BY subject ORDER BY n DESC', []);
}

export interface DictExample {
  kind: 0 | 1 | 2;
  /** Dialogues have one line per speaker. */
  lines: string[];
}

export interface DictRelation {
  kind: string;
  word: string;
  hom: number;
  senseId: number | null;
}

export interface DictWordDetail extends DictWord {
  note: string | null;
  patterns: Map<number, string>;
  examples: Map<number, DictExample[]>;
  relations: DictRelation[];
  forms: { form: string; pron: string | null }[];
}

/** Everything about one word. The compact edition simply has no extra examples, relations or forms. */
export async function getWordDetail(db: Db, id: number): Promise<DictWordDetail | null> {
  const row = await db.getFirstAsync<WordRow & { note: string | null }>(`SELECT ${WORD_COLS}, w.note FROM words w WHERE w.id = ?`, [id]);
  if (!row) return null;
  const [word] = await withSenses(db, [row]);
  const senseIds = word.senses.map((s) => s.id);
  const marks = senseIds.map(() => '?').join(',');
  const examples = new Map<number, DictExample[]>();
  const patterns = new Map<number, string>();
  if (senseIds.length) {
    for (const e of await db.getAllAsync<{ sense_id: number; kind: 0 | 1 | 2; text: string }>(`SELECT sense_id, kind, text FROM examples WHERE sense_id IN (${marks}) ORDER BY rowid`, senseIds)) {
      const list = examples.get(e.sense_id) ?? [];
      list.push({ kind: e.kind, lines: e.text.split('\n') });
      examples.set(e.sense_id, list);
    }
    for (const p of await db.getAllAsync<{ id: number; pattern: string | null }>(`SELECT id, pattern FROM senses WHERE id IN (${marks})`, senseIds)) if (p.pattern) patterns.set(p.id, p.pattern);
  }
  const relations = (await db.getAllAsync<{ kind: string; word: string; hom: number; sense_id: number | null }>('SELECT kind, word, hom, sense_id FROM relations WHERE word_id = ? ORDER BY rowid', [id])).map((r) => ({
    kind: r.kind,
    word: r.word,
    hom: r.hom,
    senseId: r.sense_id,
  }));
  const forms = await db.getAllAsync<{ form: string; pron: string | null }>('SELECT form, pron FROM forms WHERE word_id = ? ORDER BY rowid', [id]);
  return { ...word, note: row.note, patterns, examples, relations, forms };
}

/** A related word's entry, by headword and homonym number. */
export async function findWordId(db: Db, word: string, hom = 0): Promise<number | null> {
  const r = await db.getFirstAsync<{ id: number }>('SELECT id FROM words WHERE word = ? ORDER BY hom = ? DESC, hom LIMIT 1', [word, hom]);
  return r?.id ?? null;
}

/** Part of speech of words the user has, looked up by headword (for words added without one). */
export async function posOfWords(db: Db, words: string[]): Promise<Map<string, { pos: string; unit: string }>> {
  const out = new Map<string, { pos: string; unit: string }>();
  for (let i = 0; i < words.length; i += 300) {
    const chunk = words.slice(i, i + 300);
    const rows = await db.getAllAsync<{ word: string; pos: string; unit: string }>(
      `SELECT word, pos, unit FROM words WHERE word IN (${chunk.map(() => '?').join(',')}) ORDER BY CASE WHEN level = 0 THEN 9 ELSE level END DESC`,
      chunk,
    );
    // The last row per word wins: graded (more common) homonyms are sorted last.
    for (const r of rows) out.set(r.word, { pos: r.pos, unit: r.unit });
  }
  return out;
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
