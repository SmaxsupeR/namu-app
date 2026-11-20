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
  return pref === 'system' ? ['system'] : ['supertonic', 'system'];
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
      let failed = false;
      for (const id of engineOrder(opts.preference())) {
        const engine = engines.find((e) => e.id === id);
        if (!engine) continue;
        if (token !== generation) return { ok: false, reason: 'superseded' };
        let ready = false;
        try {
          ready = await engine.isReady();
        } catch {
          ready = false;
        }
        if (!ready) continue;
        if (token !== generation) return { ok: false, reason: 'superseded' };
        try {
          await engine.play({ text, rate, isCurrent: () => token === generation });
        } catch (e) {
          failed = true;
          log('tts.play_failed', { engine: id, length: text.length, error: e instanceof Error ? e.message : String(e) });
          await engine.stop().catch(() => {});
          continue;
        }
        if (token !== generation) {
          // A newer call arrived while this one was starting: silence it.
          await engine.stop().catch(() => {});
          return { ok: false, reason: 'superseded' };
        }
        return { ok: true, engine: id };
      }
      return { ok: false, reason: failed ? 'failed' : 'no_voice' };
    },
    async stop() {
      generation++;
      await stopAll();
    },
  };
}
