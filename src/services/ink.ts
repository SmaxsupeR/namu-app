// Handwriting recognition: the model pack from the namu-voices catalog (downloaded only
// when the user asks), and the rule that decides whether a written answer is accepted.
// Recognition itself runs in the native module, on the phone.

export const INK_FORMAT = 1;
const MAX_BYTES = 200 * 1024 * 1024;

export interface InkFile {
  file: string;
  size: number;
  sha256: string;
}

export interface InkOffer {
  id: string;
  version: number;
  size: number;
  base: string;
  files: InkFile[];
}

export interface InkInstalled {
  id: string;
  version: number;
  bytes: number;
  /** Folder with rec.onnx and dict.txt. */
  dir: string;
}

export interface InkIO {
  fileSize(file: string): Promise<number>;
  readText(file: string): Promise<string | null>;
  writeTextAtomic(file: string, text: string): Promise<unknown>;
  deleteTree(file: string): Promise<unknown>;
  listDir(dir: string): Promise<string[]>;
  sha256(file: string): Promise<string>;
  freeSpaceMb(dir: string): Promise<number>;
  moveDir(from: string, to: string): Promise<unknown>;
  download(url: string, dest: string, size: number, onBytes: (bytes: number) => void): Promise<number>;
  cancelDownload(): void;
}

export type InkError = 'no_space' | 'corrupt' | 'cancelled' | 'network' | 'bad_catalog' | 'no_pack';
export class InkFailure extends Error {
  constructor(public code: InkError) {
    super(code);
  }
}

const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
const FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,60}$/;
const REQUIRED = ['rec.onnx', 'dict.txt'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown, max = MAX_BYTES): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max;

/** Handwriting packs listed in the catalog (entries that fail any check are skipped). */
export function parseInkCatalog(json: unknown): InkOffer[] {
  if (!isObj(json) || typeof json.baseUrl !== 'string' || !json.baseUrl.startsWith('https://') || !json.baseUrl.includes('{ref}')) throw new InkFailure('bad_catalog');
  const out: InkOffer[] = [];
  for (const d of Array.isArray(json.ink) ? json.ink : []) {
    if (!isObj(d) || d.format !== INK_FORMAT || typeof d.id !== 'string' || !ID.test(d.id) || !posInt(d.version, 1000)) continue;
    if (typeof d.ref !== 'string' || !COMMIT.test(d.ref) || typeof d.path !== 'string' || !PATH.test(d.path) || !Array.isArray(d.files)) continue;
    const files: InkFile[] = [];
    for (const f of d.files) if (isObj(f) && typeof f.file === 'string' && FILE.test(f.file) && posInt(f.size) && typeof f.sha256 === 'string' && SHA.test(f.sha256)) files.push({ file: f.file, size: f.size, sha256: f.sha256 });
    if (files.length !== d.files.length || !REQUIRED.every((r) => files.some((f) => f.file === r))) continue;
    const size = files.reduce((a, f) => a + f.size, 0);
    if (!posInt(d.size) || d.size !== size) continue;
    out.push({ id: d.id, version: d.version, size, base: `${json.baseUrl.replace('{ref}', d.ref)}${d.path}/`, files });
  }
  return out;
}

export function createInkPack(io: InkIO, root: string, fetchJson: (url: string) => Promise<unknown>, catalogUrl: string) {
  const record = `${root}/installed.json`;
  let stopping = false;

  async function installed(): Promise<InkInstalled | null> {
    try {
      const text = await io.readText(record);
      if (!text) return null;
      const j = JSON.parse(text) as Record<string, unknown>;
      if (typeof j.id !== 'string' || !ID.test(j.id) || !posInt(j.version, 1000) || !posInt(j.bytes) || !isObj(j.sizes)) return null;
      const dir = `${root}/${j.id}-v${j.version}`;
      // A file that is missing or has another size means the pack is damaged: offer it again.
      for (const name of REQUIRED) if ((await io.fileSize(`${dir}/${name}`)) !== j.sizes[name]) return null;
      return { id: j.id, version: j.version, bytes: j.bytes, dir };
    } catch {
      return null;
    }
  }

  async function offer(): Promise<InkOffer | null> {
    let json: unknown;
    try {
      json = await fetchJson(catalogUrl);
    } catch {
      throw new InkFailure('network');
    }
    return parseInkCatalog(json)[0] ?? null;
  }

  async function install(o: InkOffer, onProgress: (done: number, total: number) => void = () => {}): Promise<InkInstalled> {
    stopping = false;
    const tmp = `${root}/.dl-${o.id}-v${o.version}`;
    if ((await io.freeSpaceMb(root)) * 1048576 < o.size * 2 + 20 * 1048576) throw new InkFailure('no_space');
    const got = new Map<string, number>();
    const done = () => [...got.values()].reduce((a, b) => a + b, 0);
    for (const f of o.files) {
      if (stopping) throw new InkFailure('cancelled');
      const dest = `${tmp}/${f.file}`;
      if ((await io.fileSize(dest)) === f.size && (await io.sha256(dest)) === f.sha256) {
        got.set(f.file, f.size);
        continue;
      }
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        if (attempt > 0) await io.deleteTree(dest);
        try {
          await io.download(o.base + f.file, dest, f.size, (b) => {
            got.set(f.file, Math.min(b, f.size));
            onProgress(done(), o.size);
          });
        } catch (e) {
          if (stopping || (e as { code?: string }).code === 'E_CANCELLED') throw new InkFailure('cancelled');
          throw new InkFailure('network');
        }
        ok = (await io.fileSize(dest)) === f.size && (await io.sha256(dest)) === f.sha256;
      }
      if (!ok) throw new InkFailure('corrupt');
      got.set(f.file, f.size);
    }
    const dir = `${root}/${o.id}-v${o.version}`;
    await io.deleteTree(dir);
    await io.moveDir(tmp, dir);
    const sizes = Object.fromEntries(o.files.map((f) => [f.file, f.size]));
    await io.writeTextAtomic(record, JSON.stringify({ id: o.id, version: o.version, bytes: o.size, sizes }));
    // Older versions and leftovers go.
    for (const name of await io.listDir(root)) if (name !== 'installed.json' && name !== `${o.id}-v${o.version}` && name !== LAB_FILE) await io.deleteTree(`${root}/${name}`);
    return { id: o.id, version: o.version, bytes: o.size, dir };
  }

  function cancel(): void {
    stopping = true;
    io.cancelDownload();
  }

  async function remove(): Promise<void> {
    await io.deleteTree(record);
    for (const name of await io.listDir(root)) if (name !== LAB_FILE) await io.deleteTree(`${root}/${name}`);
  }

  return { installed, offer, install, cancel, remove };
}
export type InkPack = ReturnType<typeof createInkPack>;

/** File (in the pack folder's parent) where the lab keeps its attempts; never deleted with the model. */
export const LAB_FILE = 'lab-attempts.json';

/**
 * Default acceptance threshold for the CTC loss of the expected word per character. On the
 * lab sets correct words scored under 0.46 in 99 % of cases, while near misses (one jamo
 * wrong) scored under 2.2 in only 1 % of cases (docs/handwriting-research.md).
 */
export const DEFAULT_INK_THRESHOLD = 1.5;
export const INK_THRESHOLDS = [0.75, 1.5, 2.25];

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, '');

/** Is a written answer the expected word? Exact reading, or close enough by the model's score. */
export function inkAccepts(expected: string, result: { text: string; score: number | null }, threshold = DEFAULT_INK_THRESHOLD): boolean {
  if (clean(result.text) === clean(expected)) return true;
  return result.score !== null && Number.isFinite(result.score) && result.score < threshold;
}

/** One lab attempt, kept so the threshold can be tuned on the learner's own handwriting. */
export interface InkAttempt {
  at: number;
  expected: string;
  /** What the writer says they wrote: the expected word, or a deliberate mistake. */
  intended: 'right' | 'wrong';
  text: string;
  score: number | null;
  ms: number;
  strokes: number[][];
}

export interface InkLabStats {
  right: number;
  rightAccepted: number;
  wrong: number;
  wrongAccepted: number;
  exact: number;
  msMedian: number | null;
}

/** How the rule does on the attempts, at a given threshold. */
export function inkLabStats(attempts: InkAttempt[], threshold = DEFAULT_INK_THRESHOLD): InkLabStats {
  const right = attempts.filter((a) => a.intended === 'right');
  const wrong = attempts.filter((a) => a.intended === 'wrong');
  const ms = attempts.map((a) => a.ms).sort((a, b) => a - b);
  return {
    right: right.length,
    rightAccepted: right.filter((a) => inkAccepts(a.expected, a, threshold)).length,
    wrong: wrong.length,
    wrongAccepted: wrong.filter((a) => inkAccepts(a.expected, a, threshold)).length,
    exact: right.filter((a) => clean(a.text) === clean(a.expected)).length,
    msMedian: ms.length ? ms[Math.floor(ms.length / 2)] : null,
  };
}

/** Lab attempts file: tolerant of damage (a broken file reads as empty). */
export function parseInkAttempts(text: string | null): InkAttempt[] {
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (a): a is InkAttempt =>
        isObj(a) &&
        typeof a.expected === 'string' &&
        (a.intended === 'right' || a.intended === 'wrong') &&
        typeof a.text === 'string' &&
        (a.score === null || typeof a.score === 'number') &&
        typeof a.ms === 'number' &&
        typeof a.at === 'number' &&
        Array.isArray(a.strokes),
    );
  } catch {
    return [];
  }
}
