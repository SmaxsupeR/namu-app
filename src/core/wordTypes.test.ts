import { describe, expect, it } from 'vitest';
import { countByType, filterWords, groupByType, typeOfDictWord, typeOfPos } from './wordTypes';

describe('word types', () => {
  it.each([
    ['существительное', 'noun'], ['сущ.', 'noun'], ['Глагол', 'verb'], ['гл.', 'verb'], ['прилагательное', 'adjective'], ['наречие', 'adverb'],
    ['명사', 'noun'], ['동사', 'verb'], ['형용사', 'adjective'], ['noun', 'noun'], ['verb', 'verb'], ['частица', 'grammar'], ['местоимение', 'noun'],
    ['выражение', 'expression'], ['что-то странное', 'other'],
  ])('%s → %s', (pos, type) => expect(typeOfPos(pos)).toBe(type));

  it('guesses expressions from spaces and leaves the rest unknown', () => {
    expect(typeOfPos('', '잘 먹겠습니다')).toBe('expression');
    expect(typeOfPos(null, '학교')).toBeNull();
  });

  it('maps dictionary entries', () => {
    expect(typeOfDictWord('명사', 'word')).toBe('noun');
    expect(typeOfDictWord('의존 명사', 'word')).toBe('noun');
    expect(typeOfDictWord('', 'idiom')).toBe('expression');
    expect(typeOfDictWord('어미', 'grammar')).toBe('grammar');
    expect(typeOfDictWord('품사 없음', 'word')).toBe('other');
  });
});

describe('filtering and grouping words', () => {
  const words = [
    { k: '학교', pos: 'существительное', mastery: 'new' },
    { k: '먹다', pos: 'глагол', mastery: 'stable' },
    { k: '사과', pos: '', mastery: 'learning' },
    { k: '잘 먹겠습니다', pos: '', mastery: 'new' },
    { k: '가다', pos: 'гл.', mastery: 'new' },
  ];
  const typeOf = (w: (typeof words)[number]) => typeOfPos(w.pos, w.k);

  it('filters by type and status', () => {
    expect(filterWords(words, typeOf, { type: 'verb' }).map((w) => w.k)).toEqual(['먹다', '가다']);
    expect(filterWords(words, typeOf, { type: 'verb', mastery: 'new' }).map((w) => w.k)).toEqual(['가다']);
    expect(filterWords(words, typeOf, { type: 'unknown' }).map((w) => w.k)).toEqual(['사과']);
    expect(filterWords(words, typeOf, {})).toHaveLength(5);
  });

  it('counts and groups in a fixed order', () => {
    expect(countByType(words, typeOf)).toEqual([
      { type: 'noun', n: 1 },
      { type: 'verb', n: 2 },
      { type: 'expression', n: 1 },
      { type: 'unknown', n: 1 },
    ]);
    expect(groupByType(words, typeOf).map((g) => [g.type, g.items.map((w) => w.k)])).toEqual([
      ['noun', ['학교']],
      ['verb', ['먹다', '가다']],
      ['expression', ['잘 먹겠습니다']],
      ['unknown', ['사과']],
    ]);
  });
});
