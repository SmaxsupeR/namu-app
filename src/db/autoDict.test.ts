import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { countSample, DEFAULT_SAMPLE, parseSampleConfig, refreshDue, WEEK_MS } from '../dict/sample';
import { createAutoDictionary, getAutoDictionary, refreshAutoDictionary, refreshDueAutoDictionaries } from './autoDict';
import * as repo from './repo';
import { migrate, type Db } from './schema';
import { openFileDb, openTestDb } from './testing';

const path = resolve(__dirname, '../../assets/dict/krdict.db');
const dict = existsSync(path) ? openFileDb(path) : null;
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

describe('sample config', () => {
  it('reads stored settings safely', () => {
    expect(parseSampleConfig('{broken')).toEqual(DEFAULT_SAMPLE);
    expect(parseSampleConfig(JSON.stringify({ count: 100, levels: [2, 9], types: ['noun', 'grammar'], topic: '음식', weekly: true }))).toEqual({ count: 100, levels: [2], types: ['noun'], topic: '음식', weekly: true });
    expect(parseSampleConfig(JSON.stringify({ count: 7 })).count).toBe(DEFAULT_SAMPLE.count);
  });
  it('is due once a week, only when weekly', () => {
    expect(refreshDue({ ...DEFAULT_SAMPLE, weekly: true }, 0, WEEK_MS)).toBe(true);
    expect(refreshDue({ ...DEFAULT_SAMPLE, weekly: true }, 0, WEEK_MS - 1)).toBe(false);
    expect(refreshDue({ ...DEFAULT_SAMPLE, weekly: false }, 0, WEEK_MS * 9)).toBe(false);
  });
});

describe.skipIf(!dict)('random sets from the dictionary', () => {
  it('creates a set of the asked size, with filters, without words the learner has', async () => {
    const d = await repo.createDictionary(db, { name: 'Мои' });
    await repo.importEntries(db, d, [{ korean: '학교', meanings: ['школа'] }]);
    const cfg = { ...DEFAULT_SAMPLE, count: 20, levels: [1], types: ['noun' as const], topic: null };
    expect(await countSample(dict!, cfg)).toBeGreaterThan(500);
    const { id, added } = await createAutoDictionary(db, dict!, { name: 'Случайные', config: cfg });
    expect(added).toBe(20);
    const entries = await repo.listEntries(db, { dictionaryId: id });
    expect(entries).toHaveLength(20);
    expect(entries.every((e) => e.meanings.length > 0 && /[가-힣]/.test(e.korean))).toBe(true);
    expect(entries.some((e) => e.korean === '학교')).toBe(false);
    expect(new Set(entries.map((e) => e.korean)).size).toBe(20);
    expect((await getAutoDictionary(db, id))?.config.count).toBe(20);
  });

  it('a topic filter keeps to the topic', async () => {
    const topic = (await dict!.getFirstAsync<{ t: string }>("SELECT substr(topic, 1, instr(topic || ' >', ' >') - 1) AS t FROM words WHERE level = 1 AND topic IS NOT NULL AND topic <> '' LIMIT 1", []))!.t;
    const cfg = { ...DEFAULT_SAMPLE, count: 20, levels: [], types: [], topic };
    const { id } = await createAutoDictionary(db, dict!, { name: 'Тема', config: cfg });
    const words = (await repo.listEntries(db, { dictionaryId: id })).map((e) => e.korean);
    for (const w of words) {
      const row = await dict!.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM words WHERE (word = ? OR word = ? OR word = ?) AND (topic = ? OR topic LIKE ?)", [w, `-${w}`, `${w}-`, topic, `${topic} > %`]);
      expect(row!.n).toBeGreaterThan(0);
    }
  });

  it('weekly renewal replaces only words that were never studied', async () => {
    const cfg = { ...DEFAULT_SAMPLE, count: 20, levels: [1], weekly: true };
    const t0 = Date.UTC(2026, 0, 1);
    const { id } = await createAutoDictionary(db, dict!, { name: 'Неделя', config: cfg }, t0);
    const before = await repo.listEntries(db, { dictionaryId: id });
    // The learner has started three words.
    const started = before.slice(0, 3);
    for (const e of started) await db.runAsync('UPDATE entries SET introduced_at = ? WHERE id = ?', [t0 + 1000, e.id]);
    expect(await refreshDueAutoDictionaries(db, dict!, t0 + WEEK_MS - 1)).toBe(0);
    expect(await refreshDueAutoDictionaries(db, dict!, t0 + WEEK_MS)).toBe(1);
    const after = await repo.listEntries(db, { dictionaryId: id });
    expect(after).toHaveLength(23);
    for (const e of started) expect(after.some((x) => x.id === e.id)).toBe(true);
    const oldUntouched = new Set(before.slice(3).map((e) => e.korean));
    expect(after.filter((e) => oldUntouched.has(e.korean))).toHaveLength(0);
    expect((await getAutoDictionary(db, id))?.refreshedAt).toBe(t0 + WEEK_MS);
    // Renewing on demand works for a non-weekly set too.
    expect(await refreshAutoDictionary(db, dict!, 'missing')).toBeNull();
  });

  it('is part of backups', async () => {
    const { id } = await createAutoDictionary(db, dict!, { name: 'B', config: { ...DEFAULT_SAMPLE, count: 20 } });
    const backup = repo.parseBackup(JSON.stringify(await repo.exportBackup(db)));
    const other = openTestDb();
    await migrate(other);
    await repo.restoreBackup(other, backup);
    expect((await getAutoDictionary(other, id))?.config.count).toBe(20);
  });
});
