// When the background synthesis queue may work. Pure, so the rules are tested.
//
// Priorities: P0 a word the user is waiting for, P1 words of the open session,
// P2 words planned for today and just added, P3 every word (only if the user
// switched that on). Lower priorities need more battery and a cooler phone.

export type Priority = 0 | 1 | 2 | 3;

export interface DeviceConditions {
  /** 0–100, or -1 when unknown. */
  battery: number;
  charging: boolean;
  powerSave: boolean;
  /** Android thermal status: 0 none, 1 light, 2 moderate, 3 severe, 4+ critical; -1 unknown. */
  thermal: number;
  availRamMb: number;
  lowMemory: boolean;
}

export type PauseReason = 'background' | 'battery' | 'power_save' | 'thermal' | 'memory' | 'unavailable';

/** Free RAM below which nothing is synthesized. */
export const MIN_FREE_RAM_MB = 400;
/** Battery needed (when not charging) per priority. */
export const MIN_BATTERY: Record<Priority, number> = { 0: 5, 1: 5, 2: 20, 3: 50 };
/** Hottest thermal status still allowed per priority. */
export const MAX_THERMAL: Record<Priority, number> = { 0: 2, 1: 2, 2: 1, 3: 1 };
/** Waits after failure 1, 2, 3, 4 (then the text is marked failed). */
export const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** Why a job of this priority may not run now, or null if it may. */
export function pauseReason(p: Priority, c: DeviceConditions, foreground: boolean): PauseReason | null {
  if (!foreground) return 'background';
  if (c.lowMemory || c.availRamMb < MIN_FREE_RAM_MB) return 'memory';
  if (c.thermal > MAX_THERMAL[p]) return 'thermal';
  if (!c.charging) {
    if (c.powerSave && p >= 2) return 'power_save';
    if (c.battery >= 0 && c.battery < MIN_BATTERY[p]) return 'battery';
  }
  return null;
}

/** Delay before the next try after `attempts` failures, or null once the text should be given up. */
export function backoff(attempts: number): number | null {
  return attempts >= MAX_ATTEMPTS ? null : BACKOFF_MS[Math.max(0, attempts - 1)];
}
