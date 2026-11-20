// Persistent cache of neural-voice audio. A word synthesized once is played
// from disk afterwards, instantly and without the model in memory.
//
// Key: SHA-256 of everything that changes the sound (cache format, engine,
// pack and version, voice, synthesis settings, text after number spelling).
// Files: <dir>/<key>.wav, written by the native side through a temporary file
// and a rename. Rows in tts_cache (migration v4) track size and last use; the
// least recently used audio goes first once the cache passes its limit.
import type { Db } from '../../db/schema';
import { normalizeNumbers } from './numbers';
import { SYNTH } from './supertonicEngine';

// 2: loudness-normalized audio (all earlier recordings are made again).
export const CACHE_FORMAT = 'namu-tts-cache-2';
export const ENGINE_NAME = 'supertonic-3';
/** Default size limit; eviction brings the cache down to 90 % of it. */
export const CACHE_LIMIT_BYTES = 250 * 1024 * 1024;

export interface CacheIO {
  fileSize(file: string): Promise<number>;
  deleteTree(file: string): Promise<unknown>;
  listDir(dir: string): Promise<string[]>;
}

export interface CacheContext {
  /** Pack id and version, e.g. "int8w@1". */
  pack: string;
  voice: string;
}

export interface CacheDeps {
  db: () => Promise<Db>;
  io: CacheIO;
  dir: string;
  sha256: (s: string) => Promise<string>;
  /** Synthesizes `text` into `out`; resolves with the audio length in seconds. */
  synth: (text: string, out: string) => Promise<{ audioSec: number }>;
  now?: () => number;
  limitBytes?: () => number;
}

const KEY_FILE = /^([0-9a-f]{64})\.wav$/;

/** Text exactly as the voice will read it. */
export function speechText(text: string): string {
  return normalizeNumbers(text.normalize('NFC').replace(/\s+/g, ' ').trim());
}

export function createAudioCache(deps: CacheDeps) {
  const now = deps.now ?? Date.now;
  const limit = deps.limitBytes ?? (() => CACHE_LIMIT_BYTES);
  const fileOf = (key: string) => `${deps.dir}/${key}.wav`;
  // One synthesis per key at a time, however many callers ask for it.
  const inFlight = new Map<string, Promise<string>>();

  async function keyFor(text: string, ctx: CacheContext): Promise<string> {
    return deps.sha256(JSON.stringify([CACHE_FORMAT, ENGINE_NAME, ctx.pack, ctx.voice, SYNTH.steps, SYNTH.speed, SYNTH.seed, speechText(text)]));
  }

  /** Path of the cached audio, or null. A row whose file is gone or wrong is dropped. */
  async function lookup(key: string): Promise<string | null> {
    const db = await deps.db();
    const row = await db.getFirstAsync<{ bytes: number }>('SELECT bytes FROM tts_cache WHERE key = ?', [key]);
    if (!row) return null;
    const file = fileOf(key);
    if ((await deps.io.fileSize(file)) !== row.bytes) {
      await db.runAsync('DELETE FROM tts_cache WHERE key = ?', [key]);
      await deps.io.deleteTree(file);
      return null;
    }
    await db.runAsync('UPDATE tts_cache SET last_used_at = ?, uses = uses + 1 WHERE key = ?', [now(), key]);
    return file;
  }

  async function has(key: string): Promise<boolean> {
    const db = await deps.db();
    return (await db.getFirstAsync('SELECT 1 AS x FROM tts_cache WHERE key = ?', [key])) !== null;
  }

  /** Synthesizes into the cache (or returns what is already there) and returns the file. */
  function create(text: string, ctx: CacheContext, key: string): Promise<string> {
    const running = inFlight.get(key);
    if (running) return running;
    const job = (async () => {
      const cached = await lookup(key);
      if (cached) return cached;
      const file = fileOf(key);
      const spoken = speechText(text);
      const r = await deps.synth(spoken, file);
      const bytes = await deps.io.fileSize(file);
      if (bytes <= 44) throw new Error('E_EMPTY_AUDIO');
      const db = await deps.db();
      const t = now();
      await db.runAsync(
        `INSERT INTO tts_cache (key, text, pack, voice, bytes, duration_ms, created_at, last_used_at, uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(key) DO UPDATE SET bytes = excluded.bytes, duration_ms = excluded.duration_ms, last_used_at = excluded.last_used_at`,
        [key, spoken, ctx.pack, ctx.voice, bytes, Math.round(r.audioSec * 1000), t, t],
      );
      await evict(key);
      return file;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
    return job;
  }

  /** Removes the least recently used audio until the cache is under 90 % of its limit. */
  async function evict(keep?: string): Promise<number> {
    const db = await deps.db();
    const total = (await db.getFirstAsync<{ n: number | null }>('SELECT SUM(bytes) AS n FROM tts_cache', []))?.n ?? 0;
    if (total <= limit()) return 0;
    const target = limit() * 0.9;
    let size = total;
    let removed = 0;
    const rows = await db.getAllAsync<{ key: string; bytes: number }>('SELECT key, bytes FROM tts_cache ORDER BY last_used_at ASC, created_at ASC', []);
    for (const r of rows) {
      if (size <= target) break;
      if (r.key === keep) continue;
      await db.runAsync('DELETE FROM tts_cache WHERE key = ?', [r.key]);
      await deps.io.deleteTree(fileOf(r.key));
      size -= r.bytes;
      removed++;
    }
    return removed;
  }

  /**
   * Brings files and rows back in step after a crash or a restore: drops rows
   * without a file, files without a row and half-written temporary files.
   */
  async function reconcile(): Promise<{ rows: number; files: number }> {
    const db = await deps.db();
    const rows = await db.getAllAsync<{ key: string; bytes: number }>('SELECT key, bytes FROM tts_cache', []);
    const known = new Map(rows.map((r) => [r.key, r.bytes]));
    let droppedRows = 0;
    let droppedFiles = 0;
    const names = await deps.io.listDir(deps.dir).catch(() => [] as string[]);
    const present = new Set<string>();
    for (const name of names) {
      const m = KEY_FILE.exec(name);
      if (m && known.has(m[1])) {
        present.add(m[1]);
        continue;
      }
      await deps.io.deleteTree(`${deps.dir}/${name}`);
      droppedFiles++;
    }
    for (const [key, bytes] of known) {
      if (present.has(key) && (await deps.io.fileSize(fileOf(key))) === bytes) continue;
      await db.runAsync('DELETE FROM tts_cache WHERE key = ?', [key]);
      if (present.has(key)) await deps.io.deleteTree(fileOf(key));
      droppedRows++;
    }
    await evict();
    return { rows: droppedRows, files: droppedFiles };
  }

  async function stats(): Promise<{ count: number; bytes: number }> {
    const db = await deps.db();
    const r = await db.getFirstAsync<{ c: number; n: number | null }>('SELECT COUNT(*) AS c, SUM(bytes) AS n FROM tts_cache', []);
    return { count: r?.c ?? 0, bytes: r?.n ?? 0 };
  }

  /** Deletes all cached audio, or all except the given pack's (after a pack update). */
  async function clear(keepPack?: string | null): Promise<void> {
    const db = await deps.db();
    const rows = await db.getAllAsync<{ key: string }>(keepPack ? 'SELECT key FROM tts_cache WHERE pack <> ?' : 'SELECT key FROM tts_cache', keepPack ? [keepPack] : []);
    for (const r of rows) {
      await db.runAsync('DELETE FROM tts_cache WHERE key = ?', [r.key]);
      await deps.io.deleteTree(fileOf(r.key));
    }
  }

  return { keyFor, lookup, has, create, evict, reconcile, stats, clear, fileOf };
}

export type AudioCache = ReturnType<typeof createAudioCache>;
