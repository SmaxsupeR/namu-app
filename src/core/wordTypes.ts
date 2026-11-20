// Word types used to group and filter words, both in the user's dictionaries
// (where the part of speech is free text) and in the bundled dictionary (where
// it is a Korean grammatical term).

export type WordType = 'noun' | 'verb' | 'adjective' | 'adverb' | 'determiner' | 'interjection' | 'expression' | 'grammar' | 'other';

export const WORD_TYPES: WordType[] = ['noun', 'verb', 'adjective', 'adverb', 'determiner', 'interjection', 'expression', 'grammar', 'other'];

/** Korean part-of-speech names of the dictionary, by type. */
export const DICT_POS: Record<WordType, string[]> = {
  noun: ['명사', '의존 명사', '대명사', '수사'],
  verb: ['동사', '보조 동사'],
  adjective: ['형용사', '보조 형용사'],
  adverb: ['부사'],
  determiner: ['관형사'],
  interjection: ['감탄사'],
  expression: [],
  grammar: ['조사', '어미', '접사'],
  other: ['품사 없음', ''],
};

const PATTERNS: [WordType, RegExp][] = [
  ['noun', /^(сущ|сущест|существительное|местоим|числит|noun|pronoun|numeral|명사|의존 명사|대명사|수사|n\.?$)/i],
  ['verb', /^(гл|глагол|verb|동사|보조 동사|v\.?$)/i],
  ['adjective', /^(прил|прилагательное|adj|adjective|형용사|보조 형용사)/i],
  ['adverb', /^(нар|наречие|adv|adverb|부사)/i],
  ['determiner', /^(опред|определитель|determiner|관형사)/i],
  ['interjection', /^(межд|междометие|interjection|감탄사)/i],
  ['expression', /^(выраж|фраз|идиом|пословиц|expression|phrase|idiom|구|관용구|속담)/i],
  ['grammar', /^(част|оконч|аффикс|суфф|грамм|particle|ending|suffix|grammar|조사|어미|접사|문법)/i],
];

/**
 * Type of a word from its part of speech (Russian, Korean or English, full or
 * abbreviated). Without one, a multi-word entry counts as an expression;
 * otherwise the type is unknown (null).
 */
export function typeOfPos(pos: string | null | undefined, korean?: string): WordType | null {
  const p = (pos ?? '').trim();
  if (p) {
    for (const [type, re] of PATTERNS) if (re.test(p)) return type;
    return 'other';
  }
  if (korean && /\s/.test(korean.trim())) return 'expression';
  return null;
}

/** Type of a bundled-dictionary entry. */
export function typeOfDictWord(pos: string, unit: string): WordType {
  if (unit === 'phrase' || unit === 'idiom' || unit === 'proverb') return 'expression';
  if (unit === 'grammar') return 'grammar';
  for (const t of WORD_TYPES) if (DICT_POS[t].includes(pos)) return t;
  return 'other';
}

export type TypeKey = WordType | 'unknown';
export const TYPE_ORDER: TypeKey[] = [...WORD_TYPES, 'unknown'];

export interface WordFilter<M extends string = string> {
  type?: TypeKey;
  mastery?: M;
}

/** Applies a type and learning-status filter. */
export function filterWords<T extends { mastery: string }>(items: T[], typeOf: (item: T) => WordType | null, f: WordFilter): T[] {
  return items.filter((item) => (!f.type || (typeOf(item) ?? 'unknown') === f.type) && (!f.mastery || item.mastery === f.mastery));
}

/** How many words of each type, in display order; types without words are left out. */
export function countByType<T>(items: T[], typeOf: (item: T) => WordType | null): { type: TypeKey; n: number }[] {
  const n = new Map<TypeKey, number>();
  for (const item of items) {
    const k = typeOf(item) ?? 'unknown';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return TYPE_ORDER.filter((k) => n.has(k)).map((type) => ({ type, n: n.get(type)! }));
}

/** Words split into groups by type, in display order; order inside a group is kept. */
export function groupByType<T>(items: T[], typeOf: (item: T) => WordType | null): { type: TypeKey; items: T[] }[] {
  const groups = new Map<TypeKey, T[]>();
  for (const item of items) {
    const k = typeOf(item) ?? 'unknown';
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return TYPE_ORDER.filter((k) => groups.has(k)).map((type) => ({ type, items: groups.get(type)! }));
}
