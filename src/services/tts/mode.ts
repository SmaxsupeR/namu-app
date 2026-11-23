// Memory modes of the neural voice. "fast" expands the INT8 weights to float at
// load (quicker synthesis, ~690 MB peak on test phones); "light" keeps them
// compressed (~300 MB, slower). The app picks one itself; the user is never asked.

export type MemoryMode = 'fast' | 'light';

export interface DeviceFacts {
  totalRamMb: number;
  availRamMb: number;
  lowRamDevice: boolean;
  cores: number;
}

/** Below this much RAM the neural voice is not used at all. */
export const MIN_RAM_MB = 3000;
/** Fast mode needs a phone with at least this much RAM… */
export const FAST_RAM_MB = 6000;
/** …and this much currently free. */
export const FAST_FREE_MB = 1200;
export const LIGHT_FREE_MB = 500;

/** Modes to try, best first. An empty list means: use the system voice. */
export function modesFor(d: DeviceFacts): MemoryMode[] {
  if (d.lowRamDevice || d.totalRamMb < MIN_RAM_MB) return [];
  const out: MemoryMode[] = [];
  if (d.totalRamMb >= FAST_RAM_MB && d.availRamMb >= FAST_FREE_MB) out.push('fast');
  if (d.availRamMb >= LIGHT_FREE_MB) out.push('light');
  return out;
}

/** ONNX threads: four big cores are the sweet spot on the phones measured. */
export function threadsFor(d: DeviceFacts): number {
  return Math.max(1, Math.min(4, d.cores));
}

/** Errors after which a lighter mode is worth trying. */
export function isMemoryError(code: string | undefined): boolean {
  return code === 'E_OUT_OF_MEMORY' || code === 'E_LOAD_FAILED';
}
