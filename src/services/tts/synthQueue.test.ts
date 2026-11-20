import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../db/schema';
import { openTestDb } from '../../db/testing';
import { createAudioCache } from './audioCache';
import { MAX_ATTEMPTS, type DeviceConditions } from './queuePolicy';
import { createSynthQueue } from './synthQueue';

const sha = async (s: string) => createHash('sha256').update(s).digest('hex');
const GOOD: DeviceConditions = { battery: 80, charging: false, powerSave: false, thermal: 0, availRamMb: 3000, lowMemory: false };

async function setup(opts: { failTimes?: Map<string, number>; unavailable?: boolean } = {}) {
  const db = openTestDb();
  await migrate(db);
  const files = new Map<string, number>();
  const synthesized: string[] = [];
  const world = { t: 1_000_000, cond: { ...GOOD }, fg: true, ctx: { pack: 'int8w@1', voice: 'F1' } as { pack: string; voice: string } | null, unavailable: opts.unavailable ?? false };
  const fails = opts.failTimes ?? new Map();
  const cache = createAudioCache({
    db: async () => db,
    io: { fileSize: async (f) => files.get(f) ?? -1, deleteTree: async (f) => void files.delete(f), listDir: async () => [] },
    dir: '/c',
    sha256: sha,
    now: () => world.t,
    synth: async (text, out) => {
      if (world.unavailable) throw new Error('E_UNAVAILABLE');
      const left = fails.get(text) ?? 0;
      if (left > 0) {
        fails.set(text, left - 1);
        throw new Error('E_SYNTH_FAILED');
      }
      synthesized.push(text);
      files.set(out, 1000);
      return { audioSec: 1 };
    },
  });
  const timers: { fn: () => void; at: number }[] = [];
  const make = () =>
    createSynthQueue({
      db: async () => db,
      cache,
      context: async () => world.ctx,
      conditions: async () => world.cond,
      foreground: () => world.fg,
      sha256: sha,
      now: () => world.t,
      schedule: (fn, ms) => {
        const timer = { fn, at: world.t + ms };
        timers.push(timer);
        return () => timers.splice(timers.indexOf(timer), 1);
      },
    });
  return { db, cache, world, synthesized, make, timers };
}

describe('synthesis queue', () => {
  it('queues each text once, skips audio that exists, keeps the most urgent priority', async () => {
    const s = await setup();
    const q = s.make();
    await s.cache.create('학교', s.world.ctx!, await s.cache.keyFor('학교', s.world.ctx!));
    expect(await q.enqueue(['사과', '사과 ', '학교', '', '우유'], 3)).toBe(2);
    await q.enqueue(['우유'], 1);
    expect((await q.status()).pending).toEqual([0, 1, 0, 1]);
  });

  it('does the most urgent text first, one at a time', async () => {
    const s = await setup();
    const q = s.make();
    await q.enqueue(['셋'], 3);
    await q.enqueue(['둘'], 2);
    await q.enqueue(['영'], 0);
    for (let i = 0; i < 3; i++) expect((await q.step()).result).toBe('done');
    expect(s.synthesized).toEqual(['영', '둘', '셋']);
    expect((await q.step()).result).toBe('idle');
  });

  it('spells out numbers once, so "3개" and "세 개" are the same job', async () => {
    const s = await setup();
    const q = s.make();
    expect(await q.enqueue(['3개', '세 개'], 2)).toBe(1);
    await q.step();
    expect(s.synthesized).toEqual(['세 개']);
  });

  it('retries with growing waits, then gives up; an urgent request revives it', async () => {
    const s = await setup({ failTimes: new Map([['학교', 99]]) });
    const q = s.make();
    await q.enqueue(['학교'], 2);
    expect((await q.step()).result).toBe('failed');
    const waiting = await q.step();
    expect(waiting.result).toBe('waiting');
    expect(waiting.nextMs).toBe(5_000);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      s.world.t += 3_600_000;
      expect((await q.step()).result).toBe('failed');
    }
    expect((await q.status()).failed).toBe(1);
    expect((await q.step()).result).toBe('idle');
    const row = await s.db.getFirstAsync<{ last_error: string }>('SELECT last_error FROM tts_queue', []);
    expect(row?.last_error).toBe('E_SYNTH_FAILED');
    // The user asks for the word again: it gets a fresh chance.
    await q.enqueue(['학교'], 0);
    expect((await q.status()).failed).toBe(0);
  });

  it('pauses low priorities on a low battery but still prepares the current word', async () => {
    const s = await setup();
    const q = s.make();
    s.world.cond = { ...GOOD, battery: 30 };
    await q.enqueue(['모두'], 3);
    expect(await q.step()).toMatchObject({ result: 'paused' });
    expect((await q.status()).paused).toBe('battery');
    await q.enqueue(['지금'], 0);
    expect((await q.step()).result).toBe('done');
    s.world.cond = { ...GOOD, battery: 30, charging: true };
    expect((await q.step()).result).toBe('done');
    expect(s.synthesized).toEqual(['지금', '모두']);
  });

  it('waits in the background and on a hot phone', async () => {
    const s = await setup();
    const q = s.make();
    await q.enqueue(['학교'], 1);
    s.world.fg = false;
    expect(await q.step()).toEqual({ result: 'paused', nextMs: null });
    s.world.fg = true;
    s.world.cond = { ...GOOD, thermal: 3 };
    expect((await q.step()).result).toBe('paused');
    expect((await q.status()).paused).toBe('thermal');
  });

  it('does not count tries while the model cannot run', async () => {
    const s = await setup({ unavailable: true });
    const q = s.make();
    await q.enqueue(['학교'], 1);
    expect((await q.step()).result).toBe('paused');
    const row = await s.db.getFirstAsync<{ attempts: number }>('SELECT attempts FROM tts_queue', []);
    expect(row?.attempts).toBe(0);
    s.world.unavailable = false;
    expect((await q.step()).result).toBe('done');
  });

  it('holds everything after a memory warning', async () => {
    const s = await setup();
    const q = s.make();
    await q.enqueue(['학교'], 0);
    q.pauseFor(60_000, 'memory');
    expect((await q.step()).result).toBe('paused');
    s.world.t += 61_000;
    expect((await q.step()).result).toBe('done');
  });

  it('continues after a restart', async () => {
    const s = await setup();
    await s.make().enqueue(['하나', '둘'], 2);
    const again = s.make();
    expect((await again.status()).pending[2]).toBe(2);
    await again.step();
    await again.step();
    expect(s.synthesized).toEqual(['하나', '둘']);
  });

  it('runs by itself once started, until the queue is empty', async () => {
    const s = await setup();
    const q = s.make();
    q.start();
    await q.enqueue(['하나', '둘', '셋'], 2);
    for (let i = 0; i < 20 && s.timers.length; i++) {
      const next = s.timers.sort((a, b) => a.at - b.at).shift()!;
      s.world.t = Math.max(s.world.t, next.at);
      next.fn();
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(s.synthesized).toEqual(['하나', '둘', '셋']);
    expect((await q.status()).pending).toEqual([0, 0, 0, 0]);
  });

  it('queues nothing without a usable voice pack, and can drop a priority', async () => {
    const s = await setup();
    const q = s.make();
    s.world.ctx = null;
    expect(await q.enqueue(['학교'], 1)).toBe(0);
    s.world.ctx = { pack: 'int8w@1', voice: 'F1' };
    await q.enqueue(['학교'], 3);
    await q.drop(3);
    expect((await q.status()).pending).toEqual([0, 0, 0, 0]);
  });
});
