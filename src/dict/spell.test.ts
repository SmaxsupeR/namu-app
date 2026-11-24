import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openFileDb } from '../db/testing';
import { checkable, checkSpelling, jamo, jamoDistance, spellKey } from './spell';

const path = resolve(__dirname, '../../assets/dict/krdict.db');

describe('spelling helpers', () => {
  it('compares words letter by letter (jamo)', () => {
    expect(jamo('학교')).toEqual(['ㅎ', 'ㅏ', 'ㄱ', 'ㄱ', 'ㅛ']);
    expect(jamoDistance('학교', '학고')).toBe(1);
    expect(jamoDistance('선생님', '선생닌')).toBe(1);
    expect(jamoDistance('학교', '학교')).toBe(0);
  });
  it('checks single Hangul words only', () => {
    expect(checkable('학교')).toBe(true);
    expect(checkable('~에서')).toBe(true);
    expect(spellKey('~에서')).toBe('에서');
    expect(checkable('PC방')).toBe(false);
    expect(checkable('2시')).toBe(false);
    expect(checkable('잘 지내요')).toBe(false);
  });
});

describe.skipIf(!existsSync(path))('spelling against the dictionary', () => {
  it('knows dictionary words and suggests the right one for a typo', async () => {
    const db = openFileDb(path);
    const r = await checkSpelling(db, ['학교', '학고', '선생닌', '컴퓨타', '학교']);
    expect(r.get('학교')).toEqual({ known: true, suggestions: [] });
    expect(r.get('학고')?.known).toBe(false);
    expect(r.get('학고')?.suggestions).toContain('학교');
    expect(r.get('선생닌')?.suggestions[0]).toBe('선생님');
    expect(r.get('컴퓨타')?.suggestions).toContain('컴퓨터');
    expect(r.size).toBe(4);
  });
});
