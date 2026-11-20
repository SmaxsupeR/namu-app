// The neural Korean voice (Supertonic 3) as a TtsEngine. Picks the memory mode
// itself, falls back to a lighter mode when memory runs short, and steps aside
// (so the system voice speaks) when the phone cannot run it.
import { isMemoryError, modesFor, threadsFor, type DeviceFacts, type MemoryMode } from './mode';
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
  /** Synthesizes into a file (used by the cache and the queue in later stages). */
  synthToFile(text: string, out: string): Promise<{ audioSec: number; totalMs: number }>;
}

export function createSupertonicEngine(deps: SupertonicDeps): SupertonicEngine {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  let loaded: { dir: string; mode: MemoryMode } | null = null;
  let loading: Promise<{ dir: string; mode: MemoryMode } | null> | null = null;
  let failedAt = -Infinity;
  let counter = 0;

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
    async synthToFile(text, out) {
      const ready = await ensureLoaded();
      if (!ready) throw new Error('E_UNAVAILABLE');
      return deps.native.synthToFile(text, ready.voice, SYNTH.steps, SYNTH.speed, SYNTH.seed, out);
    },
  };
}
