// Word sets picked at random from the bundled dictionary ("100 random beginner nouns",
// "words of the week"), turned into ordinary entries of a user dictionary.
import { DICT_POS, type WordType } from '../core/wordTypes';
import type { Db } from '../db/schema';
import type { EntryInput } from '../db/repo';
import { POS_RU } from './lookup';

export const SAMPLE_COUNTS = [20, 50, 100, 200];
/** Word types offered for sets (grammar endings and "other" are not vocabulary to drill). */
export const SAMPLE_TYPES: WordType[] = ['noun', 'verb', 'adjective', 'adverb', 'expression'];
export const WEEK_MS = 7 * 86400000;

export interface SampleConfig {
  count: number;
  /** 1 beginner, 2 intermediate, 3 advanced; empty = any level. */
  levels: number[];
  /** Empty = nouns, verbs, adjectives and adverbs. */
  types: WordType[];
  /** Top-level topic of the dictionary (e.g. "음식"), or null for any. */
  topic: string | null;
  /** Replace the words not started yet once a week. */
  weekly: boolean;
}

export const DEFAULT_SAMPLE: SampleConfig = { count: 50, levels: [1], types: [], topic: null, weekly: false };

/** Reads a stored config, falling back to defaults for anything missing or broken. */
export function parseSampleConfig(text: string | null): SampleConfig {
  try {
    const v = JSON.parse(text ?? '') as Partial<SampleConfig>;
    return {
      count: SAMPLE_COUNTS.includes(v.count as number) ? (v.count as number) : DEFAULT_SAMPLE.count,
      levels: Array.isArray(v.levels) ? v.levels.filter((l) => l === 1 || l === 2 || l === 3) : DEFAULT_SAMPLE.levels,
      types: Array.isArray(v.types) ? v.types.filter((t): t is WordType => SAMPLE_TYPES.includes(t as WordType)) : [],
      topic: typeof v.topic === 'string' && v.topic.length < 80 ? v.topic : null,
      weekly: v.weekly === true,
    };
  } catch {
    return { ...DEFAULT_SAMPLE };
  }
}

function where(cfg: SampleConfig): { sql: string; params: (string | number)[] } {
  const parts: string[] = ["w.word NOT GLOB '*[^가-힣 -]*'", "w.word GLOB '*[가-힣]*'"];
  const params: (string | number)[] = [];
  if (cfg.levels.length) {
    parts.push(`w.level IN (${cfg.levels.map(() => '?').join(',')})`);
    params.push(...cfg.levels);
  } else parts.push('w.level > 0');
  const types = cfg.types.length ? cfg.types : (['noun', 'verb', 'adjective', 'adverb'] as WordType[]);
  const kinds: string[] = [];
  const words = types.filter((t) => t !== 'expression').flatMap((t) => DICT_POS[t]);
  if (words.length) {
    kinds.push(`(w.unit = 'word' AND w.pos IN (${words.map(() => '?').join(',')}))`);
    params.push(...words);
  }
  if (types.includes('expression')) kinds.push("w.unit IN ('phrase', 'idiom')");
  parts.push(`(${kinds.join(' OR ')})`);
  if (cfg.topic) {
    parts.push("(w.topic = ? OR w.topic LIKE ? ESCAPE '\\')");
    params.push(cfg.topic, cfg.topic.replace(/[\\%_]/g, (m) => '\\' + m) + ' > %');
  }
  return { sql: parts.join(' AND '), params };
}

/** How many dictionary words match the filters (for the "N available" hint). */
export async function countSample(db: Db, cfg: SampleConfig): Promise<number> {
  const w = where(cfg);
  const row = await db.getFirstAsync<{ n: number }>(`SELECT count(DISTINCT w.word) AS n FROM words w WHERE ${w.sql}`, w.params);
  return row?.n ?? 0;
}

/** A dictionary headword as the learner writes it: without the - of endings and affixes. */
const clean = (word: string) => word.replace(/^-|-$/g, '').trim();

/**
 * Picks `n` random words matching the filters, skipping keys in `exclude` (words the learner
 * already has), each with its first meaning (two if short), first example and part of speech.
 */
export async function sampleWords(db: Db, cfg: SampleConfig, n: number, exclude: (korean: string) => boolean): Promise<EntryInput[]> {
  if (n <= 0) return [];
  const w = where(cfg);
  const rows = await db.getAllAsync<{ id: number; word: string; pos: string; origin: string | null }>(
    `SELECT w.id, w.word, w.pos, w.origin FROM words w WHERE ${w.sql} ORDER BY random() LIMIT ?`,
    [...w.params, n * 3 + 20],
  );
  const out: EntryInput[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (out.length >= n) break;
    const korean = clean(r.word);
    if (!korean || seen.has(korean) || exclude(korean)) continue;
    const senses = await db.getAllAsync<{ ru: string; example: string | null }>('SELECT ru, example FROM senses WHERE word_id = ? ORDER BY n LIMIT 2', [r.id]);
    if (senses.length === 0 || !senses[0].ru.trim()) continue;
    seen.add(korean);
    // Senses often repeat a word ("делить; разделять" and "разделять"): keep each part once.
    const used = new Set<string>();
    const parts = (ru: string) => ru.split(';').map((x) => x.trim()).filter((x) => x && !used.has(x.toLowerCase()) && used.add(x.toLowerCase()));
    const meanings = [parts(senses[0].ru).join('; ')];
    const more = senses[1] ? parts(senses[1].ru).join('; ') : '';
    if (more && more.length + meanings[0].length < 40) meanings.push(more);
    out.push({
      korean,
      meanings,
      example: senses[0].example ?? null,
      partOfSpeech: POS_RU[r.pos] ?? null,
      notes: r.origin && /[㐀-鿿]/.test(r.origin) ? r.origin : null,
    });
  }
  return out;
}

/** Whether a weekly set is due for new words. */
export function refreshDue(cfg: SampleConfig, refreshedAt: number, now: number): boolean {
  return cfg.weekly && now - refreshedAt >= WEEK_MS;
}
