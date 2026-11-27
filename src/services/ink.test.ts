import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInkPack, DEFAULT_INK_THRESHOLD, inkAccepts, inkLabStats, LAB_FILE, parseInkAttempts, parseInkCatalog, type InkAttempt, type InkIO } from './ink';

const REF = 'b'.repeat(40);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const FILES: Record<string, string> = { 'rec.onnx': 'MODEL'.repeat(100), 'dict.txt': '가\n나\n', LICENSE: 'Apache' };
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'korean-hw', version: 1, format: 1, path: 'ink/korean-hw-v1', ref: REF,
  size: Object.values(FILES).reduce((a, b) => a + b.length, 0),
  files: Object.entries(FILES).map(([file, body]) => ({ file, size: body.length, sha256: sha(body) })),
  ...over,
});
const catalog = (over?: Record<string, unknown>) => ({ format: 1, baseUrl: 'https://raw.githubusercontent.com/SmaxsupeR/namu-voices/{ref}/', ink: [entry(over)] });

function world(serve: Record<string, string> = FILES) {
  const disk = new Map<string, string>();
  const io: InkIO = {
    fileSize: async (f) => disk.get(f)?.length ?? -1,
    readText: async (f) => disk.get(f) ?? null,
    writeTextAtomic: async (f, t) => void disk.set(f, t),
    deleteTree: async (f) => void [...disk.keys()].filter((k) => k === f || k.startsWith(f + '/')).forEach((k) => disk.delete(k)),
    listDir: async (d) => [...new Set([...disk.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1).split('/')[0]))],
    sha256: async (f) => sha(disk.get(f) ?? ''),
    freeSpaceMb: async () => 1000,
    moveDir: async (from, to) => {
      for (const k of [...disk.keys()]) if (k.startsWith(from + '/')) {
        disk.set(to + k.slice(from.length), disk.get(k)!);
        disk.delete(k);
      }
    },
    async download(url, dest, _size, onBytes) {
      const body = serve[url.split('/').pop()!];
      disk.set(dest, body);
      onBytes(body.length);
      return body.length;
    },
    cancelDownload: () => {},
  };
  return { io, disk };
}

describe('handwriting pack', () => {
  it('reads the catalog and rejects broken entries', () => {
    const [o] = parseInkCatalog(catalog());
    expect(o.base).toBe(`https://raw.githubusercontent.com/SmaxsupeR/namu-voices/${REF}/ink/korean-hw-v1/`);
    expect(parseInkCatalog(catalog({ size: 1 }))).toEqual([]);
    expect(parseInkCatalog(catalog({ ref: 'main' }))).toEqual([]);
    expect(parseInkCatalog(catalog({ files: [{ file: 'dict.txt', size: 6, sha256: sha('가\n나\n') }], size: 6 }))).toEqual([]);
    expect(parseInkCatalog(catalog({ path: '../x' }))).toEqual([]);
    expect(() => parseInkCatalog({ baseUrl: 'http://x/{ref}/' })).toThrow();
  });

  it('installs, verifies every file and survives restarts', async () => {
    const { io, disk } = world();
    const pack = createInkPack(io, '/s/ink', async () => catalog(), 'u');
    expect(await pack.installed()).toBeNull();
    const o = (await pack.offer())!;
    const got = await pack.install(o);
    expect(got.dir).toBe('/s/ink/korean-hw-v1');
    expect(disk.get('/s/ink/korean-hw-v1/rec.onnx')).toBe(FILES['rec.onnx']);
    expect([...disk.keys()].some((k) => k.includes('.dl-'))).toBe(false);
    expect((await createInkPack(io, '/s/ink', async () => catalog(), 'u').installed())?.dir).toBe(got.dir);
  });

  it('refuses a file that does not match its checksum', async () => {
    const { io } = world({ ...FILES, 'rec.onnx': 'EVIL'.repeat(125) });
    const pack = createInkPack(io, '/s/ink', async () => catalog(), 'u');
    await expect(pack.install((await pack.offer())!)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await pack.installed()).toBeNull();
  });

  it('a damaged model reads as not installed; removing keeps the lab attempts', async () => {
    const { io, disk } = world();
    const pack = createInkPack(io, '/s/ink', async () => catalog(), 'u');
    await pack.install((await pack.offer())!);
    disk.set(`/s/ink/${LAB_FILE}`, '[]');
    disk.set('/s/ink/korean-hw-v1/rec.onnx', 'short');
    expect(await pack.installed()).toBeNull();
    await pack.remove();
    expect(disk.get(`/s/ink/${LAB_FILE}`)).toBe('[]');
    expect([...disk.keys()]).toEqual([`/s/ink/${LAB_FILE}`]);
  });
});

describe('accepting a written answer', () => {
  it('accepts an exact reading or a close enough score', () => {
    expect(inkAccepts('학교', { text: '학교', score: 9 })).toBe(true);
    expect(inkAccepts('학교', { text: '학 교', score: null })).toBe(true);
    expect(inkAccepts('학교', { text: '학고', score: 0.4 })).toBe(true);
    expect(inkAccepts('학교', { text: '학고', score: 3 })).toBe(false);
    expect(inkAccepts('학교', { text: '', score: null })).toBe(false);
    expect(inkAccepts('학교', { text: '학고', score: 1 }, 0.75)).toBe(false);
    expect(DEFAULT_INK_THRESHOLD).toBeGreaterThan(0.46);
  });

  it('summarises lab attempts and reads a damaged file as empty', () => {
    const a = (over: Partial<InkAttempt>): InkAttempt => ({ at: 1, expected: '학교', intended: 'right', text: '학교', score: 0.1, ms: 30, strokes: [[0, 0, 1, 1]], ...over });
    const s = inkLabStats([a({}), a({ text: '학고', score: 0.9 }), a({ text: 'x', score: 4 }), a({ intended: 'wrong', text: '학고', score: 3 }), a({ intended: 'wrong', text: '학고', score: 1 })]);
    expect(s).toMatchObject({ right: 3, rightAccepted: 2, wrong: 2, wrongAccepted: 1, exact: 1, msMedian: 30 });
    expect(parseInkAttempts('{broken')).toEqual([]);
    expect(parseInkAttempts(JSON.stringify([a({}), { nope: 1 }]))).toHaveLength(1);
  });
});
