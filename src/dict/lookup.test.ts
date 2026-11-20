import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openFileDb } from '../db/testing';
import { queryKind, ruKey, search, translationOf } from './lookup';

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
