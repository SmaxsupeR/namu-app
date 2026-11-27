// Pre-made audio of every dictionary headword in one voice, made on a server with the
// same model and settings as the app and downloaded from the namu-voices catalog.
// Stored as one SQLite file (table audio(text, data)), downloaded in parts.
//
// As a speech engine it plays these recordings at once and never synthesizes; texts
// it does not have go to the neural voice or the phone voice.
import type { TtsEngine } from './types';

export const DICT_AUDIO_FORMAT = 1;
const MAX_BYTES = 800 * 1024 * 1024;

export interface DictAudioPart {
  file: string;
  size: number;
  sha256: string;
}

export interface DictAudioOffer {
  id: string;
  version: number;
  voice: string;
  count: number;
  size: number;
  sha256: string;
  base: string;
  parts: DictAudioPart[];
}

export interface DictAudioInstalled {
  id: string;
  version: number;
  voice: string;
  count: number;
  bytes: number;
  file: string;
}

export interface DictAudioIO {
  fileSize(file: string): Promise<number>;
  readText(file: string): Promise<string | null>;
  writeTextAtomic(file: string, text: string): Promise<unknown>;
  deleteTree(file: string): Promise<unknown>;
  listDir(dir: string): Promise<string[]>;
  sha256(file: string): Promise<string>;
  freeSpaceMb(dir: string): Promise<number>;
  concatFiles(parts: string[], to: string): Promise<unknown>;
  download(url: string, dest: string, size: number, onBytes: (bytes: number) => void): Promise<number>;
  cancelDownload(): void;
}

export type DictAudioError = 'no_space' | 'corrupt' | 'cancelled' | 'network' | 'bad_catalog' | 'no_pack';
export class DictAudioFailure extends Error {
  constructor(public code: DictAudioError) {
    super(code);
  }
}

const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
const FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,60}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown, max = MAX_BYTES): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max;

export function parseDictAudioCatalog(json: unknown): DictAudioOffer[] {
  if (!isObj(json) || typeof json.baseUrl !== 'string' || !json.baseUrl.startsWith('https://') || !json.baseUrl.includes('{ref}')) throw new DictAudioFailure('bad_catalog');
  const base = json.baseUrl;
  const out: DictAudioOffer[] = [];
  for (const d of Array.isArray(json.dictAudio) ? json.dictAudio : []) {
    if (!isObj(d) || d.format !== DICT_AUDIO_FORMAT || typeof d.id !== 'string' || !ID.test(d.id) || !posInt(d.version, 1000)) continue;
    if (typeof d.voice !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(d.voice) || typeof d.ref !== 'string' || !COMMIT.test(d.ref) || typeof d.path !== 'string' || !PATH.test(d.path)) continue;
    if (!posInt(d.size) || typeof d.sha256 !== 'string' || !SHA.test(d.sha256) || !posInt(d.count, 1_000_000) || !Array.isArray(d.parts) || d.parts.length === 0) continue;
    const parts: DictAudioPart[] = [];
    for (const p of d.parts) if (isObj(p) && typeof p.file === 'string' && FILE.test(p.file) && posInt(p.size) && typeof p.sha256 === 'string' && SHA.test(p.sha256)) parts.push({ file: p.file, size: p.size, sha256: p.sha256 });
    if (parts.length !== d.parts.length || parts.reduce((a, p) => a + p.size, 0) !== d.size) continue;
    out.push({ id: d.id, version: d.version, voice: d.voice, count: d.count, size: d.size, sha256: d.sha256, base: `${base.replace('{ref}', d.ref)}${d.path}/`, parts });
  }
  return out;
}

export function createDictAudioPack(io: DictAudioIO, root: string, fetchJson: (url: string) => Promise<unknown>, catalogUrl: string) {
  const record = `${root}/installed.json`;
  let stopping = false;

  async function installed(): Promise<DictAudioInstalled | null> {
    try {
      const text = await io.readText(record);
      if (!text) return null;
      const j = JSON.parse(text) as Record<string, unknown>;
      if (typeof j.id !== 'string' || !ID.test(j.id) || !posInt(j.version, 1000) || typeof j.voice !== 'string' || !posInt(j.bytes)) return null;
      const file = `${root}/${j.id}-v${j.version}.db`;
      if ((await io.fileSize(file)) !== j.bytes) return null;
      return { id: j.id, version: j.version, voice: j.voice, count: typeof j.count === 'number' ? j.count : 0, bytes: j.bytes, file };
    } catch {
      return null;
    }
  }

  async function offer(): Promise<DictAudioOffer | null> {
    let json: unknown;
    try {
      json = await fetchJson(catalogUrl);
    } catch {
      throw new DictAudioFailure('network');
    }
    return parseDictAudioCatalog(json)[0] ?? null;
  }

  async function install(o: DictAudioOffer, onProgress: (done: number, total: number) => void = () => {}): Promise<DictAudioInstalled> {
    stopping = false;
    const partsDir = `${root}/.parts-${o.id}-v${o.version}`;
    const have = new Map<string, number>();
    for (const p of o.parts) have.set(p.file, Math.max(0, Math.min(p.size, await io.fileSize(`${partsDir}/${p.file}`))));
    const missing = o.parts.reduce((a, p) => a + p.size - (have.get(p.file) ?? 0), 0);
    if ((await io.freeSpaceMb(root)) * 1048576 < missing + o.size + 30 * 1048576) throw new DictAudioFailure('no_space');
    const done = () => [...have.values()].reduce((a, b) => a + b, 0);
    for (const p of o.parts) {
      if (stopping) throw new DictAudioFailure('cancelled');
      const dest = `${partsDir}/${p.file}`;
      if (have.get(p.file) === p.size && (await io.sha256(dest)) === p.sha256) continue;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        if (attempt > 0) {
          await io.deleteTree(dest);
          have.set(p.file, 0);
        }
        try {
          await io.download(o.base + p.file, dest, p.size, (b) => {
            have.set(p.file, Math.min(b, p.size));
            onProgress(done(), o.size);
          });
        } catch (e) {
          if (stopping || (e as { code?: string }).code === 'E_CANCELLED') throw new DictAudioFailure('cancelled');
          throw new DictAudioFailure('network');
        }
        ok = (await io.fileSize(dest)) === p.size && (await io.sha256(dest)) === p.sha256;
      }
      if (!ok) throw new DictAudioFailure('corrupt');
    }
    const file = `${root}/${o.id}-v${o.version}.db`;
    await io.concatFiles(
      o.parts.map((p) => `${partsDir}/${p.file}`),
      file,
    );
    if ((await io.fileSize(file)) !== o.size || (await io.sha256(file)) !== o.sha256) {
      await io.deleteTree(file);
      throw new DictAudioFailure('corrupt');
    }
    await io.writeTextAtomic(record, JSON.stringify({ id: o.id, version: o.version, voice: o.voice, count: o.count, bytes: o.size }));
    await io.deleteTree(partsDir);
    for (const f of await io.listDir(root)) if (f !== 'installed.json' && `${root}/${f}` !== file) await io.deleteTree(`${root}/${f}`);
    return { id: o.id, version: o.version, voice: o.voice, count: o.count, bytes: o.size, file };
  }

  function cancel() {
    stopping = true;
    io.cancelDownload();
  }

  async function remove(): Promise<void> {
    await io.deleteTree(record);
    for (const f of await io.listDir(root)) await io.deleteTree(`${root}/${f}`);
  }

  return { installed, offer, install, cancel, remove };
}

export type DictAudioPack = ReturnType<typeof createDictAudioPack>;

export interface DictAudioNative {
  dictAudio(db: string, text: string, out: string): Promise<boolean>;
  dictAudioHas(db: string, text: string): Promise<boolean>;
  playFile(file: string, speed?: number): Promise<number>;
  stopPlayback(): void;
}

/**
 * The pre-made dictionary audio as a speech engine. Speaks only texts it has, and only
 * while the chosen voice is the voice the audio was made with.
 */
export function createDictAudioEngine(deps: {
  native: DictAudioNative;
  installed: () => Promise<DictAudioInstalled | null>;
  voice: () => string;
  /** Text as the audio is keyed (numbers spelled out, spacing normalized). */
  key: (text: string) => string;
  tmpDir: string;
}): TtsEngine {
  let counter = 0;
  const usable = async () => {
    const p = await deps.installed();
    return p && p.voice === deps.voice() ? p : null;
  };
  return {
    id: 'dictaudio',
    async isReady() {
      return (await usable().catch(() => null)) !== null;
    },
    async hasAudio(text) {
      const p = await usable();
      if (!p) return false;
      const key = deps.key(text);
      // A rare failed read must not send the word to the phone voice: ask again once.
      return deps.native.dictAudioHas(p.file, key).catch(() => deps.native.dictAudioHas(p.file, key));
    },
    async play({ text, rate, isCurrent }) {
      const p = await usable();
      if (!p) throw new Error('E_UNAVAILABLE');
      const key = deps.key(text);
      const once = async () => {
        const out = `${deps.tmpDir}/dict-${counter++ % 2}.webm`;
        if (!(await deps.native.dictAudio(p.file, key, out))) throw new Error('E_NOT_FOUND');
        if (!isCurrent()) return;
        await deps.native.playFile(out, rate);
      };
      try {
        await once();
      } catch (e) {
        if (!isCurrent() || (e instanceof Error && e.message === 'E_NOT_FOUND')) throw e;
        await once();
      }
    },
    async stop() {
      deps.native.stopPlayback();
    },
  };
}
