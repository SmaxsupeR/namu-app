import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openFileDb } from '../db/testing';
import { browse, countWords, findWordId, getWordDetail, posOfWords, queryKind, ruKey, search, subjectCounts, topicCounts, translationOf } from './lookup';

// Runs against the real dictionary asset.
const path = resolve(__dirname, '../../assets/dict/krdict.db');
const db = existsSync(path) ? openFileDb(path) : null;
const d = db ? describe : describe.skip;

describe('query kind', () => {
  it('detects the script', () => {
    expect(queryKind('학교')).toBe('korean');
    expect(queryKind('ㅎ')).toBe('korean');
    expect(queryKind('Школа')).toBe('russian');
    expect(queryKind('school')).toBe('none');
    expect(ruKey('  Ёлка!! ')).toBe('елка');
  });
});

d('dictionary search (real data)', () => {
  it('finds a Korean word with its Russian translation first', async () => {
    const r = await search(db!, '학교');
    expect(r[0].word).toBe('학교');
    expect(r[0].senses[0].ru).toBe('школа');
    expect(r[0].origin).toBe('學校');
    expect(r[0].level).toBe(1);
    expect(r.slice(1).every((w) => w.word.startsWith('학교'))).toBe(true);
  });

  it('finds a verb from its stem', async () => {
    const r = await search(db!, '먹');
    expect(r.map((w) => w.word)).toContain('먹다');
    expect(r[0].word === '먹다' || r[0].word === '먹').toBe(true);
  });

  it('finds Korean words for a Russian word, plain matches first', async () => {
    const r = await search(db!, 'школа');
    expect(r[0].word).toBe('학교');
    expect(r[0].senses.some((s) => s.matched)).toBe(true);
    const r2 = await search(db!, 'Яблоко');
    expect(r2[0].word).toBe('사과');
  });

  it('searches Russian by prefix while typing', async () => {
    const r = await search(db!, 'учит');
    expect(r.map((w) => w.word)).toContain('선생님');
  });

  it('returns nothing for empty or one-letter Russian queries', async () => {
    expect(await search(db!, '')).toEqual([]);
    expect(await search(db!, 'а')).toEqual([]);
  });

  it('builds a translation from chosen senses without duplicates', async () => {
    const [w] = await search(db!, '눈');
    expect(w.senses.length).toBeGreaterThan(1);
    const text = translationOf(w.senses.slice(0, 2));
    expect(text.split('; ').length).toBe(new Set(text.split('; ')).size);
  });

  it('answers quickly', async () => {
    const t0 = performance.now();
    for (const q of ['사', '사랑', 'любовь', 'дом', 'гов', '하다']) await search(db!, q);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

d('filters, browsing and details (real data)', () => {
  it('filters a search by word type and level', async () => {
    const all = await search(db!, '사');
    const verbs = await search(db!, '사', 30, { type: 'verb' });
    expect(verbs.length).toBeGreaterThan(0);
    expect(verbs.every((w) => w.pos === '동사' || w.pos === '보조 동사')).toBe(true);
    expect(verbs.length).toBeLessThan(all.length + 30);
    const ru = await search(db!, 'есть', 30, { type: 'verb', level: 1 });
    expect(ru[0].word).toBe('먹다');
    expect(ru.every((w) => w.level === 1)).toBe(true);
  });

  it('browses a topic, beginner words first', async () => {
    const fruit = await browse(db!, { topic: '식생활 > 과일' });
    expect(fruit.map((w) => w.word)).toContain('사과');
    const levels = fruit.map((w) => (w.level === 0 ? 9 : w.level));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    const food = await countWords(db!, { topic: '식생활' });
    expect(food).toBeGreaterThan(fruit.length);
    expect((await topicCounts(db!)).length).toBe(139);
    expect((await subjectCounts(db!))[0].n).toBeGreaterThan(100);
  });

  it('lists expressions and grammar separately', async () => {
    expect((await browse(db!, { type: 'expression' }, 0, 5)).every((w) => w.unit !== 'word')).toBe(true);
    expect((await browse(db!, { type: 'grammar' }, 0, 50)).every((w) => ['조사', '어미', '접사'].includes(w.pos) || w.unit === 'grammar')).toBe(true);
  });

  it('gives the details of a word', async () => {
    const [w] = await search(db!, '학교');
    const detail = (await getWordDetail(db!, w.id))!;
    expect(detail.word).toBe('학교');
    expect(detail.topic).toBe('교육 > 교육 기관');
    expect(await findWordId(db!, '학교')).toBe(w.id);
  });

  it('finds parts of speech for words the user already has', async () => {
    const m = await posOfWords(db!, ['학교', '먹다', '없는말']);
    expect(m.get('학교')?.pos).toBe('명사');
    expect(m.get('먹다')?.pos).toBe('동사');
    expect(m.has('없는말')).toBe(false);
  });
});

const fullPath = process.env.NAMU_FULL_DICT;
const f = fullPath && existsSync(fullPath) ? describe : describe.skip;
f('full edition (NAMU_FULL_DICT)', () => {
  it('has examples, relations and inflected forms', async () => {
    const full = openFileDb(fullPath!);
    const [w] = await search(full, '먹다');
    const detail = (await getWordDetail(full, w.id))!;
    expect(detail.examples.get(detail.senses[0].id)!.length).toBeGreaterThan(3);
    expect(detail.forms.map((x) => x.form)).toContain('먹어');
    expect(detail.examples.get(detail.senses[0].id)!.some((e) => e.kind === 2 && e.lines.length >= 2)).toBe(true);
    const [s] = await search(full, '학교');
    expect((await getWordDetail(full, s.id))!.relations.length).toBeGreaterThan(0);
  });
});
