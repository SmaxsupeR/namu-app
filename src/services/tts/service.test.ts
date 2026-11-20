import { describe, expect, it } from 'vitest';
import { createSpeechService, engineOrder } from './service';
import type { EngineId, EnginePreference, TtsEngine } from './types';

/** A fake engine that records what it played and whether it is playing now. */
function fake(id: EngineId, opts: { ready?: boolean; fail?: boolean; delay?: number } = {}) {
  const state = { played: [] as string[], playing: false, stops: 0 };
  const engine: TtsEngine = {
    id,
    isReady: async () => {
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      return opts.ready ?? true;
    },
    play: async ({ text }) => {
      if (opts.fail) throw new Error('boom');
      state.played.push(text);
      state.playing = true;
    },
    stop: async () => {
      state.stops++;
      state.playing = false;
    },
  };
  return { engine, state };
}

function service(engines: TtsEngine[], pref: EnginePreference = 'auto', log?: (e: string, d?: Record<string, unknown>) => void) {
  return createSpeechService({ engines: () => engines, preference: () => pref, log });
}

describe('speech service', () => {
  it('orders engines with the system voice last', () => {
    expect(engineOrder('auto')).toEqual(['supertonic', 'system']);
    expect(engineOrder('supertonic')).toEqual(['supertonic', 'system']);
    expect(engineOrder('system')).toEqual(['system']);
  });

  it('prefers the neural voice when it is ready', async () => {
    const neural = fake('supertonic');
    const sys = fake('system');
    expect(await service([neural.engine, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'supertonic' });
    expect(neural.state.played).toEqual(['학교']);
    expect(sys.state.played).toEqual([]);
  });

  it('falls back to the system voice when the pack is missing', async () => {
    const neural = fake('supertonic', { ready: false });
    const sys = fake('system');
    expect(await service([neural.engine, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'system' });
  });

  it('falls back when the neural voice fails to start, and stops it', async () => {
    const neural = fake('supertonic', { fail: true });
    const sys = fake('system');
    const events: Record<string, unknown>[] = [];
    const r = await service([neural.engine, sys.engine], 'auto', (_e, d) => events.push(d ?? {})).speak('비밀 문장');
    expect(r).toEqual({ ok: true, engine: 'system' });
    expect(neural.state.stops).toBeGreaterThan(0);
    // Diagnostics carry the length, never the text.
    expect(JSON.stringify(events)).not.toContain('비밀');
    expect(events[0].length).toBe(5);
  });

  it('respects the system-only preference', async () => {
    const neural = fake('supertonic');
    const sys = fake('system');
    expect(await service([neural.engine, sys.engine], 'system').speak('학교')).toEqual({ ok: true, engine: 'system' });
    expect(neural.state.played).toEqual([]);
  });

  it('reports a missing voice and a failure separately', async () => {
    expect(await service([fake('system', { ready: false }).engine]).speak('학교')).toEqual({ ok: false, reason: 'no_voice' });
    expect(await service([fake('system', { fail: true }).engine]).speak('학교')).toEqual({ ok: false, reason: 'failed' });
    expect(await service([]).speak('학교')).toEqual({ ok: false, reason: 'no_voice' });
  });

  it('does not speak empty text', async () => {
    const sys = fake('system');
    expect(await service([sys.engine]).speak('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(sys.state.played).toEqual([]);
  });

  it('stops every engine before playing, so two voices never overlap', async () => {
    const neural = fake('supertonic');
    const sys = fake('system');
    const s = service([neural.engine, sys.engine]);
    await s.speak('하나');
    neural.state.playing = true;
    sys.state.playing = true;
    await s.speak('둘');
    expect(sys.state.playing).toBe(false);
    expect(neural.state.played).toEqual(['하나', '둘']);
  });

  it('drops a call overtaken by a newer one', async () => {
    const sys = fake('system', { delay: 20 });
    const s = service([sys.engine]);
    const first = s.speak('첫째');
    const second = s.speak('둘째');
    expect(await first).toEqual({ ok: false, reason: 'superseded' });
    expect(await second).toEqual({ ok: true, engine: 'system' });
    expect(sys.state.played).toEqual(['둘째']);
  });

  it('stop() cancels a call that has not started yet', async () => {
    const sys = fake('system', { delay: 20 });
    const s = service([sys.engine]);
    const call = s.speak('학교');
    await s.stop();
    expect(await call).toEqual({ ok: false, reason: 'superseded' });
    expect(sys.state.played).toEqual([]);
  });

  it('treats a throwing readiness check as not ready', async () => {
    const broken: TtsEngine = { id: 'supertonic', isReady: () => Promise.reject(new Error('x')), play: async () => {}, stop: async () => {} };
    const sys = fake('system');
    expect(await service([broken, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'system' });
  });
});

describe('speech service with a cached neural voice', () => {
  function cached(has: boolean) {
    const f = fake('supertonic');
    const prefetched: string[] = [];
    f.engine.hasAudio = async () => has;
    f.engine.prefetch = (t) => void prefetched.push(t);
    return { ...f, prefetched };
  }

  it('plays cached audio with the neural voice', async () => {
    const neural = cached(true);
    const sys = fake('system');
    expect(await service([neural.engine, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'supertonic' });
    expect(neural.prefetched).toEqual([]);
  });

  it('speaks with the phone voice at once and prepares the neural audio for next time', async () => {
    const neural = cached(false);
    const sys = fake('system');
    expect(await service([neural.engine, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'system' });
    expect(neural.prefetched).toEqual(['학교']);
    expect(neural.state.played).toEqual([]);
  });

  it('waits for the neural voice when the phone has no Korean voice', async () => {
    const neural = cached(false);
    const sys = fake('system', { ready: false });
    expect(await service([neural.engine, sys.engine]).speak('학교')).toEqual({ ok: true, engine: 'supertonic' });
    expect(neural.state.played).toEqual(['학교']);
  });

  it('does not prepare neural audio when the user chose the phone voice', async () => {
    const neural = cached(false);
    const sys = fake('system');
    await service([neural.engine, sys.engine], 'system').speak('학교');
    expect(neural.prefetched).toEqual([]);
  });
});
