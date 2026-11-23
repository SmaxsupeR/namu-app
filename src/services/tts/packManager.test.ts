import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FILES, VOICES_INDEX_URL } from './pack';
import { createPackManager, type DownloadProgress, type PackIO } from './packManager';

const REF = 'e7986d0e3cafec044c7bb176ffbc9b886e77673f';
const BASE = `https://raw.githubusercontent.com/SmaxsupeR/namu-voices/${REF}/packs/int8w/`;
const ROOT = '/data/voices';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** A server with one pack and a phone with an in-memory file system. */
function world(opts: { version?: number; freeMb?: number } = {}) {
  const files: Record<string, string> = {};
  for (const p of [...REQUIRED_FILES, 'voice_styles/F1.json', 'voice_styles/M1.json']) files[p] = `content of ${p} `.repeat(20);
  const server = new Map<string, string>();
  for (const [p, c] of Object.entries(files)) server.set(BASE + p, c);
  const manifest = { id: 'int8w', name: 'INT8', quantizedWeights: true, files: Object.entries(files).map(([path, c]) => ({ path, sha256: hash(c), size: c.length })) };
  server.set(BASE + 'manifest.json', JSON.stringify(manifest));
  const catalog = {
    format: 1,
    baseUrl: 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/{ref}/',
    packs: [{ id: 'int8w', version: opts.version ?? 1, name: 'INT8', language: 'ko', engine: 'supertonic-3', path: 'packs/int8w', size: 1000, voices: ['F1', 'M1'], ref: REF }],
  };
  server.set(VOICES_INDEX_URL, JSON.stringify(catalog));

  const disk = new Map<string, string>();
  const log = { copies: [] as string[], downloads: [] as string[], ranges: [] as number[], cutAfter: -1, corruptOnce: new Set<string>(), cancelled: false };
  const io: PackIO = {
    fileSize: async (f) => (disk.has(f) ? disk.get(f)!.length : -1),
    exists: async (f) => disk.has(f) || [...disk.keys()].some((k) => k.startsWith(f + '/')),
    readText: async (f) => disk.get(f) ?? null,
    writeTextAtomic: async (f, t) => void disk.set(f, t),
    moveDir: async (a, b) => {
      for (const k of [...disk.keys()]) if (k.startsWith(a + '/')) {
        disk.set(b + k.slice(a.length), disk.get(k)!);
        disk.delete(k);
      }
    },
    copyFile: async (a, b) => {
      log.copies.push(a);
      if (!disk.has(a)) throw new Error('missing');
      disk.set(b, disk.get(a)!);
    },
    deleteTree: async (f) => {
      for (const k of [...disk.keys()]) if (k === f || k.startsWith(f + '/')) disk.delete(k);
    },
    listDir: async (d) => [...new Set([...disk.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1).split('/')[0]))],
    sha256: async (f) => hash(disk.get(f) ?? ''),
    freeSpaceMb: async () => opts.freeMb ?? 10000,
    cancelDownload: () => {
      log.cancelled = true;
    },
    async download(url, dest, size, onBytes) {
      const body = server.get(url);
      if (body === undefined) throw Object.assign(new Error('404'), { code: 'E_HTTP_404' });
      const have = disk.get(dest) ?? '';
      log.downloads.push(url.slice(BASE.length));
      log.ranges.push(have.length);
      let rest = body.slice(have.length);
      if (log.corruptOnce.has(url.slice(BASE.length))) {
        log.corruptOnce.delete(url.slice(BASE.length));
        rest = 'X'.repeat(rest.length);
      }
      if (log.cutAfter >= 0 && log.downloads.length > log.cutAfter) {
        disk.set(dest, have + rest.slice(0, Math.floor(rest.length / 2)));
        throw Object.assign(new Error('reset'), { code: 'E_NETWORK' });
      }
      disk.set(dest, have + rest);
      onBytes(have.length + rest.length);
      return size;
    },
  };
  const fetchJson = async (url: string) => {
    const b = server.get(url);
    if (b === undefined) throw new Error('404');
    return JSON.parse(b);
  };
  const pm = createPackManager(io, ROOT, fetchJson);
  /** Publishes a new version in which some files changed. */
  const publish = (version: number, changed: Record<string, string>) => {
    for (const [p, c] of Object.entries(changed)) {
      files[p] = c;
      server.set(BASE + p, c);
    }
    const m = { ...manifest, files: Object.entries(files).map(([path, c]) => ({ path, sha256: hash(c), size: c.length })) };
    server.set(BASE + 'manifest.json', JSON.stringify(m));
    server.set(VOICES_INDEX_URL, server.get(VOICES_INDEX_URL)!.replace(/"version":\d+/, `"version":${version}`));
  };
  return { pm, disk, server, log, files, manifest, publish };
}

describe('voice pack install', () => {
  it('downloads, checks and activates a pack', async () => {
    const w = world();
    expect(await w.pm.state()).toEqual({ status: 'none' });
    const [c] = await w.pm.catalog();
    const progress: DownloadProgress[] = [];
    const rec = await w.pm.install(c, (p) => progress.push(p));
    expect(rec.folder).toBe('int8w-v1');
    expect(rec.voices).toEqual(['F1', 'M1']);
    const s = await w.pm.state();
    expect(s.status).toBe('ready');
    expect(s.status === 'ready' && s.dir).toBe(`${ROOT}/int8w-v1`);
    expect(await w.pm.verify()).toEqual([]);
    expect(progress.at(-1)?.phase).toBe('install');
    expect(progress.at(-1)?.done).toBe(progress.at(-1)?.total);
    // No temporary folder is left behind.
    expect([...w.disk.keys()].some((k) => k.includes('.partial-'))).toBe(false);
  });

  it('continues an interrupted download instead of starting over', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    w.log.cutAfter = 3;
    await expect(w.pm.install(c)).rejects.toMatchObject({ code: 'network' });
    expect((await w.pm.state()).status).toBe('none');
    const before = w.log.downloads.length;
    w.log.cutAfter = -1;
    await w.pm.install(c);
    const second = w.log.downloads.slice(before);
    // Files finished in the first attempt are not fetched again; the cut one resumes mid-file.
    expect(second).not.toContain(w.log.downloads[0]);
    expect(w.log.ranges[before]).toBeGreaterThan(0);
    expect(await w.pm.verify()).toEqual([]);
  });

  it('downloads a file again when its hash is wrong', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    w.log.corruptOnce.add('onnx/vocoder.onnx');
    await w.pm.install(c);
    expect(w.log.downloads.filter((d) => d === 'onnx/vocoder.onnx')).toHaveLength(2);
    expect(await w.pm.verify()).toEqual([]);
  });

  it('gives up on a file that stays corrupt and keeps nothing active', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    w.server.set(BASE + 'LICENSE', 'tampered');
    await expect(w.pm.install(c)).rejects.toMatchObject({ code: 'corrupt' });
    expect((await w.pm.state()).status).toBe('none');
  });

  it('refuses to start without enough free space', async () => {
    const w = world({ freeMb: 10 });
    const [c] = await w.pm.catalog();
    await expect(w.pm.install(c)).rejects.toMatchObject({ code: 'no_space' });
    expect(w.log.downloads).toEqual([]);
  });

  it('refuses a manifest that does not match the catalog', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    w.server.set(BASE + 'manifest.json', JSON.stringify({ ...w.manifest, id: 'other' }));
    await expect(w.pm.install(c)).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('can be cancelled', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    const run = w.pm.install(c, (p) => {
      if (p.phase === 'download') w.pm.cancel();
    });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect(w.log.cancelled).toBe(true);
    expect((await w.pm.state()).status).toBe('none');
  });

  it('keeps the old pack until the new version is complete, then removes it', async () => {
    const w = world();
    const [v1] = await w.pm.catalog();
    await w.pm.install(v1);
    w.publish(2, { 'onnx/vocoder.onnx': 'new vocoder '.repeat(30), 'onnx/text_encoder.onnx': 'new encoder '.repeat(30) });
    const [v2] = await w.pm.catalog();
    w.log.cutAfter = w.log.downloads.length + 1;
    await expect(w.pm.install(v2)).rejects.toBeTruthy();
    const mid = await w.pm.state();
    expect(mid.status === 'ready' && mid.pack.version).toBe(1);
    w.log.cutAfter = -1;
    await w.pm.install(v2);
    const s = await w.pm.state();
    expect(s.status === 'ready' && s.pack.version).toBe(2);
    expect([...w.disk.keys()].some((k) => k.includes('int8w-v1/'))).toBe(false);
  });

  it('downloads only the files that changed in an update', async () => {
    const w = world();
    const [v1] = await w.pm.catalog();
    await w.pm.install(v1);
    const before = w.log.downloads.length;
    w.publish(2, { 'onnx/vocoder.onnx': 'fp16 vocoder '.repeat(40) });
    const [v2] = await w.pm.catalog();
    await w.pm.install(v2);
    expect(w.log.downloads.slice(before)).toEqual(['onnx/vocoder.onnx']);
    expect(w.log.copies.length).toBe(Object.keys(w.files).length - 1);
    expect(await w.pm.verify()).toEqual([]);
    const s = await w.pm.state();
    expect(s.status === 'ready' && s.pack.version).toBe(2);
  });

  it('reports a damaged pack and removes it on request', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    await w.pm.install(c);
    w.disk.delete(`${ROOT}/int8w-v1/onnx/vocoder.onnx`);
    const s = await w.pm.state();
    expect(s.status).toBe('damaged');
    expect(s.status === 'damaged' && s.missing).toEqual(['onnx/vocoder.onnx']);
    await w.pm.remove();
    expect(await w.pm.state()).toEqual({ status: 'none' });
    expect(w.disk.size).toBe(0);
  });

  it('notices a file altered after install in the full check', async () => {
    const w = world();
    const [c] = await w.pm.catalog();
    await w.pm.install(c);
    const f = `${ROOT}/int8w-v1/onnx/tts.json`;
    w.disk.set(f, 'Y'.repeat(w.disk.get(f)!.length));
    expect((await w.pm.state()).status).toBe('ready');
    expect(await w.pm.verify()).toEqual(['onnx/tts.json']);
  });

  it('treats a damaged installed.json as no pack', async () => {
    const w = world();
    w.disk.set(`${ROOT}/installed.json`, '{broken');
    expect(await w.pm.state()).toEqual({ status: 'none' });
    w.disk.set(`${ROOT}/installed.json`, JSON.stringify({ id: 'int8w', version: 1, folder: '../../etc' }));
    expect(await w.pm.state()).toEqual({ status: 'none' });
  });
});
