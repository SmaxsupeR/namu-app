import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { exportBackup } from '../../db/repo';
import { migrate } from '../../db/schema';
import { openTestDb } from '../../db/testing';
import { createAudioCache, speechText, type CacheIO } from './audioCache';

const DIR = '/data/tts-cache';
const ctx = { pack: 'int8w@1', voice: 'F1' };

async function setup(limit = 1_000_000) {
  const db = openTestDb();
  await migrate(db);
  const files = new Map<string, number>();
  const synthesized: string[] = [];
  let t = 1000;
  const io: CacheIO = {
    fileSize: async (f) => files.get(f) ?? -1,
    deleteTree: async (f) => void files.delete(f),
    listDir: async (d) => [...files.keys()].filter((f) => f.startsWith(d + '/')).map((f) => f.slice(d.length + 1)),
  };
  const cache = createAudioCache({
    db: async () => db,
    io,
    dir: DIR,
    sha256: async (s) => createHash('sha256').update(s).digest('hex'),
    synth: async (text, out) => {
      synthesized.push(text);
      await new Promise((r) => setTimeout(r, 5));
      files.set(out, 44 + text.length * 1000);
      return { audioSec: text.length / 10 };
    },
    now: () => t,
    limitBytes: () => limit,
  });
  return { db, cache, files, synthesized, tick: (ms = 1) => (t += ms) };
}

describe('audio cache', () => {
  it('uses the same key for the same audio and a new key when anything audible changes', async () => {
    const { cache } = await setup();
    const k = await cache.keyFor('학교', ctx);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await cache.keyFor(' 학교 ', ctx)).toBe(k);
    expect(await cache.keyFor('학교', { ...ctx, voice: 'M1' })).not.toBe(k);
    expect(await cache.keyFor('학교', { ...ctx, pack: 'int8w@2' })).not.toBe(k);
    // Numbers are spelled out before hashing, so both spellings share audio.
    expect(await cache.keyFor('3개', ctx)).toBe(await cache.keyFor('세 개', ctx));
  });

  it('synthesizes once and then plays from disk', async () => {
    const { cache, synthesized, db } = await setup();
    const key = await cache.keyFor('사과 3개', ctx);
    expect(await cache.lookup(key)).toBeNull();
    const file = await cache.create('사과 3개', ctx, key);
    expect(file).toBe(`${DIR}/${key}.wav`);
    expect(synthesized).toEqual(['사과 세 개']);
    expect(await cache.lookup(key)).toBe(file);
    expect(await cache.has(key)).toBe(true);
    const row = await db.getFirstAsync<{ uses: number; text: string; voice: string }>('SELECT uses, text, voice FROM tts_cache', []);
    expect(row).toEqual({ uses: 1, text: '사과 세 개', voice: 'F1' });
  });

  it('runs one synthesis for parallel requests of the same text', async () => {
    const { cache, synthesized } = await setup();
    const key = await cache.keyFor('학교', ctx);
    const [a, b] = await Promise.all([cache.create('학교', ctx, key), cache.create('학교', ctx, key)]);
    expect(a).toBe(b);
    expect(synthesized).toHaveLength(1);
  });

  it('drops a row whose file vanished or changed', async () => {
    const { cache, files } = await setup();
    const key = await cache.keyFor('학교', ctx);
    const file = await cache.create('학교', ctx, key);
    files.set(file, 12);
    expect(await cache.lookup(key)).toBeNull();
    expect(await cache.has(key)).toBe(false);
  });

  it('evicts the least recently used audio past the limit', async () => {
    // Each 2-syllable word is 2044 bytes; the limit fits two of them.
    const { cache, tick } = await setup(5000);
    const words = ['학교', '사과', '우유'];
    const keys = await Promise.all(words.map((w) => cache.keyFor(w, ctx)));
    await cache.create(words[0], ctx, keys[0]);
    tick();
    await cache.create(words[1], ctx, keys[1]);
    tick();
    await cache.lookup(keys[0]); // 학교 was used again, so 사과 is now the oldest.
    tick();
    await cache.create(words[2], ctx, keys[2]);
    expect(await cache.has(keys[0])).toBe(true);
    expect(await cache.has(keys[1])).toBe(false);
    expect(await cache.has(keys[2])).toBe(true);
    expect((await cache.stats()).bytes).toBeLessThanOrEqual(5000);
  });

  it('never evicts the audio it has just made', async () => {
    const { cache } = await setup(100);
    const key = await cache.keyFor('학교', ctx);
    await cache.create('학교', ctx, key);
    expect(await cache.has(key)).toBe(true);
  });

  it('reconciles files and rows after a crash', async () => {
    const { cache, files, db } = await setup();
    const key = await cache.keyFor('학교', ctx);
    await cache.create('학교', ctx, key);
    const lost = await cache.keyFor('사과', ctx);
    await cache.create('사과', ctx, lost);
    files.delete(`${DIR}/${lost}.wav`);
    files.set(`${DIR}/${'a'.repeat(64)}.wav`, 100); // a file without a row
    files.set(`${DIR}/${key}.wav.part`, 50); // an interrupted write
    files.set(`${DIR}/../../etc/passwd`, 1); // nothing outside the folder is touched or trusted
    expect(await cache.reconcile()).toEqual({ rows: 1, files: 3 });
    expect(await cache.has(key)).toBe(true);
    expect(await cache.has(lost)).toBe(false);
    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tts_cache', []))?.n).toBe(1);
  });

  it('clears audio of other packs after an update', async () => {
    const { cache } = await setup();
    const old = await cache.keyFor('학교', ctx);
    await cache.create('학교', ctx, old);
    const ctx2 = { pack: 'int8w@2', voice: 'F1' };
    const fresh = await cache.keyFor('학교', ctx2);
    await cache.create('학교', ctx2, fresh);
    await cache.clear('int8w@2');
    expect(await cache.has(old)).toBe(false);
    expect(await cache.has(fresh)).toBe(true);
    await cache.clear();
    expect((await cache.stats()).count).toBe(0);
  });

  it('refuses keys that are not hashes', async () => {
    const { db } = await setup();
    await expect(db.runAsync("INSERT INTO tts_cache (key, text, pack, voice, bytes, duration_ms, created_at, last_used_at) VALUES ('../x', 't', 'p', 'v', 1, 1, 1, 1)", [])).rejects.toThrow();
  });

  it('is left out of the user backup', async () => {
    const { cache, db } = await setup();
    await cache.create('학교', ctx, await cache.keyFor('학교', ctx));
    const backup = await exportBackup(db);
    expect(Object.keys(backup.tables)).not.toContain('tts_cache');
    expect(JSON.stringify(backup)).not.toContain('학교');
  });

  it('normalizes text for speech', () => {
    expect(speechText('  사과   2개 ')).toBe('사과 두 개');
  });
});
