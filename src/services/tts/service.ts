// One entry point for speech. It picks an engine, keeps the system voice as a
// fallback, makes sure two engines never play at the same time and ignores
// calls that were overtaken by a newer one.
import type { EngineId, EnginePreference, SpeakOutcome, TtsEngine } from './types';

export interface SpeechServiceOptions {
  /** Registered engines; read on every call so engines can appear later. */
  engines: () => readonly TtsEngine[];
  preference: () => EnginePreference;
  /** Diagnostics. Never receives the spoken text, only its length. */
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface SpeechService {
  speak(text: string, opts?: { rate?: number }): Promise<SpeakOutcome>;
  stop(): Promise<void>;
}

/** Engines to try, best first. The system voice is always the last resort. */
export function engineOrder(pref: EnginePreference): EngineId[] {
  return pref === 'system' ? ['system'] : ['dictaudio', 'supertonic', 'system'];
}

export function createSpeechService(opts: SpeechServiceOptions): SpeechService {
  const log = opts.log ?? (() => {});
  // Every speak() or stop() takes a new number; older calls see they were overtaken.
  let generation = 0;

  const stopAll = async () => {
    await Promise.all(opts.engines().map((e) => e.stop().catch(() => {})));
  };

  return {
    async speak(raw, { rate = 0.9 } = {}) {
      const text = raw.trim();
      const token = ++generation;
      await stopAll();
      if (text === '') return { ok: false, reason: 'empty' };
      const engines = opts.engines();
      const order = engineOrder(opts.preference())
        .map((id) => engines.find((e) => e.id === id))
        .filter((e): e is TtsEngine => !!e);
      let failed = false;
      const ready = async (e: TtsEngine) => {
        try {
          return await e.isReady();
        } catch {
          return false;
        }
      };
      const instant = async (e: TtsEngine) => {
        if (!e.hasAudio) return true;
        try {
          return await e.hasAudio(text);
        } catch (err) {
          log('tts.check_failed', { engine: e.id, length: text.length, error: err instanceof Error ? err.message : String(err) });
          return false;
        }
      };
      /** Plays with one engine; null means "try the next one". */
      const attempt = async (engine: TtsEngine): Promise<SpeakOutcome | null> => {
        try {
          await engine.play({ text, rate, isCurrent: () => token === generation });
        } catch (e) {
          failed = true;
          log('tts.play_failed', { engine: engine.id, length: text.length, error: e instanceof Error ? e.message : String(e) });
          await engine.stop().catch(() => {});
          return null;
        }
        if (token !== generation) {
          // A newer call arrived while this one was starting: silence it.
          await engine.stop().catch(() => {});
          return { ok: false, reason: 'superseded' };
        }
        return { ok: true, engine: engine.id };
      };

      // First pass: only voices that can start right away. A slow engine without
      // ready audio prepares it in the background and lets the next voice speak.
      const slow: TtsEngine[] = [];
      for (const engine of order) {
        if (token !== generation) return { ok: false, reason: 'superseded' };
        if (!(await ready(engine))) continue;
        if (!(await instant(engine))) {
          // Only an engine that can make audio is worth waiting for (pre-made audio cannot).
          if (!engine.prefetch) log('tts.not_in_pack', { engine: engine.id, length: text.length });
          if (engine.prefetch) {
            slow.push(engine);
            engine.prefetch(text);
          }
          continue;
        }
        if (token !== generation) return { ok: false, reason: 'superseded' };
        const r = await attempt(engine);
        if (r) {
          if (r.ok && r.engine === 'system' && order.length > 1) log('tts.phone_voice', { engine: 'system', length: text.length });
          return r;
        }
      }
      // Second pass: no other voice could speak, so wait for the slow one.
      for (const engine of slow) {
        if (token !== generation) return { ok: false, reason: 'superseded' };
        const r = await attempt(engine);
        if (r) return r;
      }
      return { ok: false, reason: failed ? 'failed' : 'no_voice' };
    },
    async stop() {
      generation++;
      await stopAll();
    },
  };
}
