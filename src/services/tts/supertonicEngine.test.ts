import { describe, expect, it } from 'vitest';
import type { DeviceFacts } from './mode';
import type { PackState } from './packManager';
import { createSupertonicEngine, RETRY_AFTER_MS, SYNTH, type EngineNative } from './supertonicEngine';

const ready = (voices = ['F1', 'F2', 'M1']): PackState => ({
  status: 'ready',
  dir: '/v/int8w-v1',
  pack: { id: 'int8w', version: 1, folder: 'int8w-v1', name: 'INT8', quantizedWeights: true, voices, bytes: 1, installedAt: 0 },
});

function native(opts: { device?: Partial<DeviceFacts>; failFast?: string; failLight?: string } = {}) {
  const calls: string[] = [];
  let loaded: string | null = null;
  const n: EngineNative = {
    deviceInfo: async () => ({ totalRamMb: 12000, availRamMb: 6000, lowRamDevice: false, cores: 8, ...opts.device }),
    isLoaded: async (_d, fold) => loaded === (fold ? 'fast' : 'light'),
    load: async (_d, threads, fold) => {
      calls.push(`load:${fold ? 'fast' : 'light'}:${threads}`);
      const fail = fold ? opts.failFast : opts.failLight;
      if (fail) throw Object.assign(new Error(fail), { code: fail });
      loaded = fold ? 'fast' : 'light';
      return { loadMs: 1 };
    },
    synthToFile: async (_t, voice, steps, speed, seed, out) => {
      calls.push(`synth:${voice}:${steps}:${speed}:${seed}:${out}`);
      return { audioSec: 1, totalMs: 1 };
    },
    playFile: async (f) => {
      calls.push(`play:${f}`);
      return 1;
    },
    stopPlayback: () => void calls.push('stop'),
    release: async () => {
      calls.push('release');
      loaded = null;
    },
  };
  return { n, calls, drop: () => (loaded = null) };
}

const req = (current = true) => ({ text: '학교', rate: 1, isCurrent: () => current });

describe('neural engine', () => {
  it('is not ready without a pack', async () => {
    const { n } = native();
    const e = createSupertonicEngine({ native: n, packState: async () => ({ status: 'none' }), voice: () => 'F1', tmpDir: '/t' });
    expect(await e.isReady()).toBe(false);
    await expect(e.play(req())).rejects.toThrow();
  });

  it('loads once in fast mode and speaks with the chosen voice', async () => {
    const { n, calls } = native();
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'M1', tmpDir: '/t' });
    expect(await e.isReady()).toBe(true);
    await Promise.all([e.play(req()), e.play(req())]);
    expect(calls.filter((c) => c.startsWith('load'))).toEqual(['load:fast:4']);
    expect(calls).toContain(`synth:M1:${SYNTH.steps}:${SYNTH.speed}:${SYNTH.seed}:/t/live-0.wav`);
    expect(e.mode()).toBe('fast');
  });

  it('uses the default voice when the chosen one is not in the pack', () => {
    const { n } = native();
    const e = createSupertonicEngine({ native: n, packState: async () => ready(['F1', 'M1']), voice: () => 'M5', tmpDir: '/t' });
    expect(e.voiceFor(ready(['F1', 'M1']))).toBe('F1');
    expect(e.voiceFor(ready(['M2']))).toBe('M2');
  });

  it('falls back to light mode when fast mode runs out of memory', async () => {
    const { n, calls } = native({ failFast: 'E_OUT_OF_MEMORY' });
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'F1', tmpDir: '/t' });
    expect(await e.warmUp()).toBe(true);
    expect(e.mode()).toBe('light');
    expect(calls).toEqual(['load:fast:4', 'release', 'load:light:4']);
  });

  it('steps aside for a while when the model cannot load at all', async () => {
    let t = 0;
    const { n, calls } = native({ failFast: 'E_OUT_OF_MEMORY', failLight: 'E_OUT_OF_MEMORY' });
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'F1', tmpDir: '/t', now: () => t });
    expect(await e.warmUp()).toBe(false);
    expect(await e.isReady()).toBe(false);
    const loads = calls.length;
    expect(await e.warmUp()).toBe(false);
    expect(calls.length).toBe(loads);
    t += RETRY_AFTER_MS + 1;
    expect(await e.isReady()).toBe(true);
  });

  it('never loads on a phone that is too weak', async () => {
    const { n, calls } = native({ device: { totalRamMb: 2000 } });
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'F1', tmpDir: '/t' });
    expect(await e.warmUp()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not play audio for a call that was overtaken', async () => {
    const { n, calls } = native();
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'F1', tmpDir: '/t' });
    await e.play(req(false));
    expect(calls.some((c) => c.startsWith('play'))).toBe(false);
  });

  it('reloads after Android freed the model', async () => {
    const { n, calls, drop } = native();
    const e = createSupertonicEngine({ native: n, packState: async () => ready(), voice: () => 'F1', tmpDir: '/t' });
    await e.warmUp();
    drop();
    e.released();
    await e.play(req());
    expect(calls.filter((c) => c.startsWith('load'))).toHaveLength(2);
  });
});
