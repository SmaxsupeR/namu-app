import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDictAudioEngine, createDictAudioPack, parseDictAudioCatalog, type DictAudioIO } from './dictAudio';

const REF = 'a'.repeat(40);
const sha = (b: string) => createHash('sha256').update(b).digest('hex');
const PARTS = ['AAAA'.repeat(500), 'BBBB'.repeat(500), 'CC'.repeat(100)];
const WHOLE = PARTS.join('');
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'krdict-audio-f1', version: 1, voice: 'F1', format: 1, count: 3, path: 'dict-audio/krdict-F1', ref: REF,
  size: WHOLE.length, sha256: sha(WHOLE), parts: PARTS.map((c, i) => ({ file: `part${i}`, size: c.length, sha256: sha(c) })), ...over,
});
const catalog = (over?: Record<string, unknown>) => ({ format: 1, baseUrl: 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/{ref}/', packs: [], dictAudio: [entry(over)] });

function world(serve: string[] = PARTS, cutOnce = false) {
  const disk = new Map<string, string>();
  let cut = cutOnce;
  const fetched: string[] = [];
  const io: DictAudioIO = {
    fileSize: async (f) => disk.get(f)?.length ?? -1,
    readText: async (f) => disk.get(f) ?? null,
    writeTextAtomic: async (f, t) => void disk.set(f, t),
    deleteTree: async (f) => void [...disk.keys()].filter((k) => k === f || k.startsWith(f + '/')).forEach((k) => disk.delete(k)),
    listDir: async (d) => [...new Set([...disk.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1).split('/')[0]))],
    sha256: async (f) => sha(disk.get(f) ?? ''),
    freeSpaceMb: async () => 1000,
    concatFiles: async (parts, to) => void disk.set(to, parts.map((p) => disk.get(p) ?? '').join('')),
    async download(url, dest, size, onBytes) {
      const i = Number(url.slice(-1));
      const body = serve[i];
      const have = disk.get(dest) ?? '';
      fetched.push(`${i}@${have.length}`);
      const rest = body.slice(have.length);
      if (cut) {
        cut = false;
        disk.set(dest, have + rest.slice(0, rest.length >> 1));
        throw Object.assign(new Error('x'), { code: 'E_NETWORK' });
      }
      disk.set(dest, have + rest);
      onBytes(have.length + rest.length);
      return size;
    },
    cancelDownload: () => {},
  };
  const pack = createDictAudioPack(io, '/s/dict-audio', async () => catalog(), 'https://x/index.json');
  return { pack, disk, fetched };
}

describe('dictionary audio catalog', () => {
  it('pins part URLs to the commit and checks the parts add up', () => {
    const [o] = parseDictAudioCatalog(catalog());
    expect(o.base).toBe(`https://raw.githubusercontent.com/SmaxsupeR/namu-voices/${REF}/dict-audio/krdict-F1/`);
    expect(parseDictAudioCatalog(catalog({ size: 5 }))).toEqual([]);
    expect(parseDictAudioCatalog(catalog({ format: 2 }))).toEqual([]);
    expect(parseDictAudioCatalog(catalog({ path: '../x' }))).toEqual([]);
    expect(parseDictAudioCatalog({ format: 1, baseUrl: 'https://x/{ref}/' })).toEqual([]);
  });
});

describe('dictionary audio install', () => {
  it('downloads the parts, joins them, checks the whole file and activates it', async () => {
    const w = world();
    const r = await w.pack.install((await w.pack.offer())!);
    expect(r.voice).toBe('F1');
    expect(w.disk.get(r.file)).toBe(WHOLE);
    expect(await w.pack.installed()).toMatchObject({ id: 'krdict-audio-f1', voice: 'F1', bytes: WHOLE.length });
    expect([...w.disk.keys()].some((k) => k.includes('.parts-'))).toBe(false);
  });

  it('resumes a cut part', async () => {
    const w = world(PARTS, true);
    const o = (await w.pack.offer())!;
    await expect(w.pack.install(o)).rejects.toMatchObject({ code: 'network' });
    await w.pack.install(o);
    expect(w.fetched[1]).toMatch(/^0@[1-9]/);
  });

  it('refuses a tampered part', async () => {
    const w = world(['XXXX'.repeat(500), PARTS[1], PARTS[2]]);
    await expect(w.pack.install((await w.pack.offer())!)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await w.pack.installed()).toBeNull();
  });

  it('can be removed', async () => {
    const w = world();
    await w.pack.install((await w.pack.offer())!);
    await w.pack.remove();
    expect(w.disk.size).toBe(0);
  });
});

describe('dictionary audio engine', () => {
  const make = (voice: string, installed = true) => {
    const played: string[] = [];
    const engine = createDictAudioEngine({
      native: {
        dictAudioHas: async (_db, t) => t === '학교',
        dictAudio: async (_db, t, out) => t === '학교' && out.endsWith('.webm'),
        playFile: async (f) => void played.push(f) as unknown as number,
        stopPlayback: () => {},
      },
      installed: async () => (installed ? { id: 'a', version: 1, voice: 'F1', count: 1, bytes: 1, file: '/d.db' } : null),
      voice: () => voice,
      key: (t) => t.trim(),
      tmpDir: '/t',
    });
    return { engine, played };
  };

  it('plays words it has in its own voice', async () => {
    const { engine, played } = make('F1');
    expect(await engine.isReady()).toBe(true);
    expect(await engine.hasAudio!(' 학교 ')).toBe(true);
    expect(await engine.hasAudio!('사과')).toBe(false);
    await engine.play({ text: '학교', rate: 1, isCurrent: () => true });
    expect(played).toEqual(['/t/dict-0.webm']);
  });

  it('stays silent for another voice or without the pack', async () => {
    expect(await make('M1').engine.isReady()).toBe(false);
    expect(await make('F1', false).engine.isReady()).toBe(false);
  });
  it('tries once more when reading or playing fails now and then', async () => {
    let hasFails = 1;
    let playFails = 1;
    const played: string[] = [];
    const engine = createDictAudioEngine({
      native: {
        dictAudioHas: async () => {
          if (hasFails-- > 0) throw new Error('SQLiteException');
          return true;
        },
        dictAudio: async () => true,
        playFile: async (f) => {
          if (playFails-- > 0) throw new Error('E_PLAYBACK');
          played.push(f);
          return 1;
        },
        stopPlayback: () => {},
      },
      installed: async () => ({ id: 'a', version: 1, voice: 'F1', count: 1, bytes: 1, file: '/d.db' }),
      voice: () => 'F1',
      key: (t) => t,
      tmpDir: '/t',
    });
    expect(await engine.hasAudio!('학교')).toBe(true);
    await engine.play({ text: '학교', rate: 1, isCurrent: () => true });
    expect(played).toEqual(['/t/dict-1.webm']);
  });

  it('does not retry a word that is not in the pack', async () => {
    let calls = 0;
    const engine = createDictAudioEngine({
      native: { dictAudioHas: async () => false, dictAudio: async () => (calls++, false), playFile: async () => 1, stopPlayback: () => {} },
      installed: async () => ({ id: 'a', version: 1, voice: 'F1', count: 1, bytes: 1, file: '/d.db' }),
      voice: () => 'F1',
      key: (t) => t,
      tmpDir: '/t',
    });
    await expect(engine.play({ text: '사과', rate: 1, isCurrent: () => true })).rejects.toThrow('E_NOT_FOUND');
    expect(calls).toBe(1);
  });
});
