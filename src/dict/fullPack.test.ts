import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CATALOG_URL, createDictPack, parseDictCatalog, type DictIO } from './fullPack';

const REF = '2e9ca20958dbe46927708c22fb070dae68f15c4f';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const DB = Buffer.from('SQLite format 3\0' + 'x'.repeat(5000));
const GZ = gzipSync(DB);
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'krdict-full', version: 1, name: 'full', language: 'ko-ru', format: 2, path: 'dicts/krdict-full', file: 'krdict-full.db.gz',
  size: GZ.length, sha256: sha(GZ), unpackedSize: DB.length, unpackedSha256: sha(DB), license: 'CC BY-SA 2.0 KR', ref: REF, ...over,
});
const catalog = (over?: Record<string, unknown>) => ({ format: 1, baseUrl: 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/{ref}/', packs: [], dictionaries: [entry(over)] });

function world(opts: { free?: number; serve?: Buffer; cutOnce?: boolean } = {}) {
  const disk = new Map<string, Buffer>();
  const served = opts.serve ?? GZ;
  let cut = opts.cutOnce ?? false;
  const ranges: number[] = [];
  const io: DictIO = {
    fileSize: async (f) => disk.get(f)?.length ?? -1,
    readText: async (f) => disk.get(f)?.toString() ?? null,
    writeTextAtomic: async (f, t) => void disk.set(f, Buffer.from(t)),
    deleteTree: async (f) => void [...disk.keys()].filter((k) => k === f || k.startsWith(f + '/')).forEach((k) => disk.delete(k)),
    listDir: async (d) => [...disk.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1)),
    sha256: async (f) => sha(disk.get(f) ?? Buffer.alloc(0)),
    freeSpaceMb: async () => opts.free ?? 1000,
    gunzip: async (a, b) => {
      disk.set(b, gunzipSync(disk.get(a)!));
      return disk.get(b)!.length;
    },
    async download(_url, dest, size, onBytes) {
      const have = disk.get(dest) ?? Buffer.alloc(0);
      ranges.push(have.length);
      let rest = served.subarray(have.length);
      if (cut) {
        cut = false;
        disk.set(dest, Buffer.concat([have, rest.subarray(0, rest.length >> 1)]));
        throw Object.assign(new Error('reset'), { code: 'E_NETWORK' });
      }
      disk.set(dest, Buffer.concat([have, rest]));
      onBytes(disk.get(dest)!.length);
      return size;
    },
    cancelDownload: () => {},
  };
  const pack = createDictPack(io, '/s/dict', async (url) => {
    expect(url).toBe(CATALOG_URL);
    return catalog();
  });
  return { pack, disk, ranges };
}

describe('full dictionary catalog', () => {
  it('builds a URL pinned to the commit', () => {
    expect(parseDictCatalog(catalog())[0].url).toBe(`https://raw.githubusercontent.com/SmaxsupeR/namu-voices/${REF}/dicts/krdict-full/krdict-full.db.gz`);
  });
  it('skips entries it cannot use or trust', () => {
    expect(parseDictCatalog(catalog({ format: 3 }))).toEqual([]);
    expect(parseDictCatalog(catalog({ file: '../x.gz' }))).toEqual([]);
    expect(parseDictCatalog(catalog({ ref: 'main' }))).toEqual([]);
    expect(parseDictCatalog(catalog({ sha256: 'zz' }))).toEqual([]);
    expect(parseDictCatalog({ format: 1, baseUrl: 'https://x/{ref}/', packs: [] })).toEqual([]);
    expect(() => parseDictCatalog({ baseUrl: 'http://x/{ref}/' })).toThrow('bad_catalog');
  });
});

describe('full dictionary install', () => {
  it('downloads, checks, unpacks and activates', async () => {
    const w = world();
    expect(await w.pack.installed()).toBeNull();
    const o = (await w.pack.offer())!;
    const r = await w.pack.install(o);
    expect(r.file).toBe('/s/dict/krdict-full-v1.db');
    expect(await w.pack.installed()).toEqual({ id: 'krdict-full', version: 1, file: '/s/dict/krdict-full-v1.db', bytes: DB.length });
    expect(w.disk.has('/s/dict/krdict-full-v1.db.gz')).toBe(false);
  });

  it('resumes an interrupted download', async () => {
    const w = world({ cutOnce: true });
    const o = (await w.pack.offer())!;
    await expect(w.pack.install(o)).rejects.toMatchObject({ code: 'network' });
    await w.pack.install(o);
    expect(w.ranges[1]).toBeGreaterThan(0);
    expect(await w.pack.installed()).not.toBeNull();
  });

  it('rejects a tampered download and keeps nothing active', async () => {
    const w = world({ serve: gzipSync(Buffer.from('evil')) });
    await expect(w.pack.install((await w.pack.offer())!)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await w.pack.installed()).toBeNull();
  });

  it('checks free space first', async () => {
    const w = world({ free: 0 });
    await expect(w.pack.install((await w.pack.offer())!)).rejects.toMatchObject({ code: 'no_space' });
    expect(w.ranges).toEqual([]);
  });

  it('treats a truncated database as not installed, and removes everything', async () => {
    const w = world();
    await w.pack.install((await w.pack.offer())!);
    w.disk.set('/s/dict/krdict-full-v1.db', DB.subarray(0, 10));
    expect(await w.pack.installed()).toBeNull();
    await w.pack.remove();
    expect(w.disk.size).toBe(0);
  });
});
