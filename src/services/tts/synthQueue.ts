// Background synthesis queue: prepares neural-voice audio before it is needed.
// One text at a time, most urgent first; failed texts are retried with growing
// waits and given up after a few tries; work pauses when the app is in the
// background, the battery is low, the phone is hot or memory is short. The
// queue lives in the database (tts_queue), so it continues after a restart.
import type { Db } from '../../db/schema';
import { speechText, type AudioCache, type CacheContext } from './audioCache';
import { backoff, pauseReason, type DeviceConditions, type PauseReason, type Priority } from './queuePolicy';

export interface QueueDeps {
  db: () => Promise<Db>;
  cache: AudioCache;
  /** Active pack and voice; null when the neural voice cannot be used. */
  context: () => Promise<CacheContext | null>;
  conditions: () => Promise<DeviceConditions>;
  foreground: () => boolean;
  sha256: (s: string) => Promise<string>;
  now?: () => number;
  /** Runs fn after ms; returns a cancel function. */
  schedule?: (fn: () => void, ms: number) => () => void;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export interface QueueStatus {
  pending: [number, number, number, number];
  failed: number;
  running: boolean;
  paused: PauseReason | null;
  done: number;
}

export type StepResult = 'done' | 'skipped' | 'failed' | 'idle' | 'waiting' | 'paused';

/** Pause before re-checking a paused queue, and the gap between jobs. */
export const RECHECK_MS = 30_000;
const GAP_MS: Record<Priority, number> = { 0: 0, 1: 50, 2: 300, 3: 800 };

interface Row {
  id: string;
  text: string;
  priority: Priority;
  attempts: number;
  next_at: number;
}

export function createSynthQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  const schedule =
    deps.schedule ??
    ((fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const log = deps.log ?? (() => {});
  const listeners = new Set<(s: QueueStatus) => void>();
  let cancelTimer: (() => void) | null = null;
  let running = false;
  let started = false;
  let paused: PauseReason | null = null;
  let pausedUntil = 0;
  let done = 0;

  async function status(): Promise<QueueStatus> {
    const db = await deps.db();
    const rows = await db.getAllAsync<{ priority: Priority; failed: number; n: number }>('SELECT priority, failed, COUNT(*) AS n FROM tts_queue GROUP BY priority, failed', []);
    const pending: QueueStatus['pending'] = [0, 0, 0, 0];
    let failed = 0;
    for (const r of rows) {
      if (r.failed) failed += r.n;
      else pending[r.priority] += r.n;
    }
    return { pending, failed, running, paused, done };
  }

  async function notify() {
    if (listeners.size === 0) return;
    const s = await status().catch(() => null);
    if (s) listeners.forEach((l) => l(s));
  }

  function wake(ms: number) {
    cancelTimer?.();
    cancelTimer = schedule(() => {
      cancelTimer = null;
      void loop();
    }, ms);
  }

  /** Adds texts (deduplicated); an already queued text keeps the most urgent priority. */
  async function enqueue(texts: string[], priority: Priority): Promise<number> {
    const ctx = await deps.context();
    if (!ctx) return 0;
    const db = await deps.db();
    const t = now();
    let added = 0;
    const seen = new Set<string>();
    for (const raw of texts) {
      const text = speechText(raw);
      if (text === '' || text.length > 500 || seen.has(text)) continue;
      seen.add(text);
      if (await deps.cache.has(await deps.cache.keyFor(text, ctx))) continue;
      const id = await deps.sha256(text);
      // A text asked for urgently gets a fresh chance even if it failed before.
      await db.runAsync(
        `INSERT INTO tts_queue (id, text, priority, attempts, next_at, failed, created_at) VALUES (?, ?, ?, 0, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           priority = MIN(priority, excluded.priority),
           failed = CASE WHEN excluded.priority <= 1 THEN 0 ELSE failed END,
           attempts = CASE WHEN excluded.priority <= 1 AND failed = 1 THEN 0 ELSE attempts END,
           next_at = CASE WHEN excluded.priority <= 1 THEN MIN(next_at, excluded.next_at) ELSE next_at END`,
        [id, text, priority, t, t],
      );
      added++;
    }
    if (added && started && !running) {
      if (priority <= 1) pausedUntil = 0;
      wake(0);
    }
    if (added) void notify();
    return added;
  }

  /** Does at most one job. Exposed for tests; the app uses start(). */
  async function step(): Promise<{ result: StepResult; nextMs: number | null }> {
    const db = await deps.db();
    const t = now();
    const ctx = await deps.context();
    if (!ctx) {
      paused = 'unavailable';
      return { result: 'paused', nextMs: null };
    }
    const job = await db.getFirstAsync<Row>('SELECT id, text, priority, attempts, next_at FROM tts_queue WHERE failed = 0 AND next_at <= ? ORDER BY priority, created_at LIMIT 1', [t]);
    if (!job) {
      const later = await db.getFirstAsync<{ next_at: number }>('SELECT MIN(next_at) AS next_at FROM tts_queue WHERE failed = 0', []);
      paused = null;
      return later?.next_at ? { result: 'waiting', nextMs: Math.max(0, later.next_at - t) } : { result: 'idle', nextMs: null };
    }
    const reason = pausedUntil > t ? (paused ?? 'memory') : pauseReason(job.priority, await deps.conditions(), deps.foreground());
    if (reason) {
      paused = reason;
      return { result: 'paused', nextMs: reason === 'background' ? null : Math.max(RECHECK_MS, pausedUntil - t) };
    }
    paused = null;
    try {
      const key = await deps.cache.keyFor(job.text, ctx);
      if (await deps.cache.has(key)) {
        await db.runAsync('DELETE FROM tts_queue WHERE id = ?', [job.id]);
        return { result: 'skipped', nextMs: 0 };
      }
      await deps.cache.create(job.text, ctx, key);
      await db.runAsync('DELETE FROM tts_queue WHERE id = ?', [job.id]);
      done++;
      return { result: 'done', nextMs: GAP_MS[job.priority] };
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      if (code === 'E_UNAVAILABLE') {
        // The model cannot run right now (no memory, no pack): not the text's fault.
        paused = 'unavailable';
        return { result: 'paused', nextMs: RECHECK_MS };
      }
      const attempts = job.attempts + 1;
      const wait = backoff(attempts);
      // Only the error code is stored, never the text.
      await db.runAsync('UPDATE tts_queue SET attempts = ?, next_at = ?, failed = ?, last_error = ? WHERE id = ?', [attempts, t + (wait ?? 0), wait === null ? 1 : 0, code.slice(0, 80), job.id]);
      log('tts.queue_failed', { attempts, code: code.slice(0, 80), length: job.text.length });
      return { result: 'failed', nextMs: 0 };
    }
  }

  async function loop() {
    if (running) return;
    running = true;
    let next: number | null = null;
    try {
      const r = await step();
      next = r.nextMs;
    } catch (e) {
      log('tts.queue_error', { error: e instanceof Error ? e.message : String(e) });
      next = RECHECK_MS;
    } finally {
      running = false;
    }
    void notify();
    if (next !== null && started) wake(next);
  }

  return {
    enqueue,
    step,
    status,
    /** Starts working (at app start); the queue from the last run continues. */
    start() {
      started = true;
      wake(0);
    },
    stop() {
      started = false;
      cancelTimer?.();
      cancelTimer = null;
    },
    /** Something changed (app came to the foreground, pack installed, charger plugged in). */
    kick() {
      if (started && !running) wake(0);
    },
    /** Holds the queue for a while (Android asked to free memory). */
    pauseFor(ms: number, reason: PauseReason) {
      pausedUntil = now() + ms;
      paused = reason;
      void notify();
    },
    async retryFailed() {
      await (await deps.db()).runAsync('UPDATE tts_queue SET failed = 0, attempts = 0, next_at = ? WHERE failed = 1', [now()]);
      this.kick();
      void notify();
    },
    /** Drops queued texts of a priority (e.g. P3 when the user turns "prepare everything" off). */
    async drop(priority: Priority) {
      await (await deps.db()).runAsync('DELETE FROM tts_queue WHERE priority = ?', [priority]);
      void notify();
    },
    async clear() {
      await (await deps.db()).runAsync('DELETE FROM tts_queue', []);
      void notify();
    },
    subscribe(l: (s: QueueStatus) => void) {
      listeners.add(l);
      void notify();
      return () => listeners.delete(l);
    },
  };
}

export type SynthQueue = ReturnType<typeof createSynthQueue>;
