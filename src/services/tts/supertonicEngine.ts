// The neural Korean voice (Supertonic 3) as a TtsEngine. Picks the memory mode
// itself, falls back to a lighter mode when memory runs short, and steps aside
// (so the system voice speaks) when the phone cannot run it.
import { isMemoryError, modesFor, threadsFor, type DeviceFacts, type MemoryMode } from './mode';
import type { AudioCache, CacheContext } from './audioCache';
import type { PackState } from './packManager';
import type { TtsEngine } from './types';
import { DEFAULT_VOICE } from './voices';

export interface EngineNative {
  deviceInfo(): Promise<DeviceFacts>;
  isLoaded(dir: string, fold: boolean): Promise<boolean>;
  load(dir: string, threads: number, fold: boolean): Promise<{ loadMs: number }>;
  synthToFile(text: string, voice: string, steps: number, speed: number, seed: number, out: string): Promise<{ audioSec: number; totalMs: number }>;
  playFile(file: string): Promise<number>;
  stopPlayback(): void;
  release(): Promise<unknown>;
}

/** Synthesis settings. Fixed, so the same text always gives the same audio (needed for the cache). */
export const SYNTH = { steps: 8, speed: 1.0, seed: 42 } as const;
/** After the model failed to load, wait this long before trying again. */
export const RETRY_AFTER_MS = 10 * 60 * 1000;

export interface SupertonicDeps {
  native: EngineNative;
  packState: () => Promise<PackState>;
  voice: () => string;
  /** Folder for audio that is played once and thrown away. */
  tmpDir: string;
  now?: () => number;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface SupertonicEngine extends TtsEngine {
  /** The mode in use, or null when the model is not loaded. */
  mode(): MemoryMode | null;
  /** Loads the model ahead of time. Returns false if the phone cannot run it now. */
  warmUp(): Promise<boolean>;
  /** Frees the model's memory and forgets earlier load failures (after a pack change). */
  unload(): Promise<void>;
  /** Native side already freed the model. */
  released(): void;
  /** Voice actually used: the chosen one if the pack has it, otherwise the first voice. */
  voiceFor(state: PackState): string | null;
  /** Synthesizes into a file (used by the cache). */
  synthToFile(text: string, out: string): Promise<{ audioSec: number; totalMs: number }>;
  /** Connects the audio cache; from then on audio is played from and saved to it. */
  attachCache(cache: AudioCache): void;
  /** Cache context of the active pack and voice, or null without a usable pack. */
  context(): Promise<CacheContext | null>;
  /** Makes sure this text is in the cache (synthesizing if needed); returns the file. */
  ensureAudio(text: string): Promise<string>;
}

export function createSupertonicEngine(deps: SupertonicDeps): SupertonicEngine {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  let loaded: { dir: string; mode: MemoryMode } | null = null;
  let loading: Promise<{ dir: string; mode: MemoryMode } | null> | null = null;
  let failedAt = -Infinity;
  let counter = 0;
  let cache: AudioCache | null = null;
  // Background preparation runs one text at a time; later stages replace this with the queue.
  let prefetching: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();

  async function context(): Promise<CacheContext | null> {
    const s = await deps.packState();
    const voice = voiceFor(s);
    return s.status === 'ready' && voice ? { pack: `${s.pack.id}@${s.pack.version}`, voice } : null;
  }

  async function ensureAudio(text: string): Promise<string> {
    const ctx = await context();
    if (!ctx || !cache) throw new Error('E_UNAVAILABLE');
    const key = await cache.keyFor(text, ctx);
    return (await cache.lookup(key)) ?? (await cache.create(text, ctx, key));
  }

  const voiceFor = (s: PackState): string | null => {
    if (s.status !== 'ready') return null;
    const want = deps.voice();
    if (s.pack.voices.includes(want)) return want;
    if (s.pack.voices.includes(DEFAULT_VOICE)) return DEFAULT_VOICE;
    return s.pack.voices[0] ?? null;
  };

  async function load(dir: string): Promise<{ dir: string; mode: MemoryMode } | null> {
    if (loaded && loaded.dir === dir && (await deps.native.isLoaded(dir, loaded.mode === 'fast'))) return loaded;
    loaded = null;
    if (now() - failedAt < RETRY_AFTER_MS) return null;
    const device = await deps.native.deviceInfo();
    const modes = modesFor(device);
    for (const mode of modes) {
      try {
        const r = await deps.native.load(dir, threadsFor(device), mode === 'fast');
        log('tts.loaded', { mode, loadMs: Math.round(r.loadMs) });
        loaded = { dir, mode };
        return loaded;
      } catch (e) {
        const code = (e as { code?: string }).code;
        log('tts.load_failed', { mode, code });
        if (!isMemoryError(code)) break;
        await deps.native.release().catch(() => {});
      }
    }
    failedAt = now();
    return null;
  }

  async function ensureLoaded(): Promise<{ dir: string; voice: string } | null> {
    const s = await deps.packState();
    const voice = voiceFor(s);
    if (s.status !== 'ready' || !voice) return null;
    // Only one load at a time, however many calls arrive.
    loading ??= load(s.dir).finally(() => {
      loading = null;
    });
    const r = await loading;
    return r ? { dir: r.dir, voice } : null;
  }

  return {
    id: 'supertonic',
    async isReady() {
      try {
        if (now() - failedAt < RETRY_AFTER_MS) return false;
        const s = await deps.packState();
        return voiceFor(s) !== null;
      } catch {
        return false;
      }
    },
    async play({ text, isCurrent }) {
      if (cache) {
        const file = await ensureAudio(text);
        if (!isCurrent()) return;
        await deps.native.playFile(file);
        return;
      }
      const ready = await ensureLoaded();
      if (!ready) throw new Error('E_UNAVAILABLE');
      if (!isCurrent()) return;
      // Alternate two files so a new synthesis never overwrites the file being opened for playback.
      const out = `${deps.tmpDir}/live-${counter++ % 2}.wav`;
      await deps.native.synthToFile(text, ready.voice, SYNTH.steps, SYNTH.speed, SYNTH.seed, out);
      if (!isCurrent()) return;
      await deps.native.playFile(out);
    },
    async stop() {
      deps.native.stopPlayback();
    },
    mode: () => loaded?.mode ?? null,
    async warmUp() {
      return (await ensureLoaded()) !== null;
    },
    async unload() {
      loaded = null;
      failedAt = -Infinity;
      await deps.native.release();
    },
    released() {
      loaded = null;
    },
    voiceFor,
    attachCache(c) {
      cache = c;
    },
    context,
    ensureAudio,
    async hasAudio(text) {
      if (!cache) return false;
      const ctx = await context();
      return ctx !== null && (await cache.has(await cache.keyFor(text, ctx)));
    },
    prefetch(text) {
      if (!cache || pending.has(text)) return;
      pending.add(text);
      prefetching = prefetching
        .then(() => ensureAudio(text))
        .catch((e) => log('tts.prefetch_failed', { length: text.length, error: e instanceof Error ? e.message : String(e) }))
        .finally(() => pending.delete(text));
    },
    async synthToFile(text, out) {
      const ready = await ensureLoaded();
      if (!ready) throw new Error('E_UNAVAILABLE');
      return deps.native.synthToFile(text, ready.voice, SYNTH.steps, SYNTH.speed, SYNTH.seed, out);
    },
  };
}
