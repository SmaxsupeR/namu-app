// Voice pack status shared by every screen. A download keeps running when the
// settings screen is closed; reopening it shows the same progress.
import { create } from 'zustand';
import { currentPack, packChanged, voicePacks } from '../services/speech';
import type { DownloadProgress, InstallErrorCode, PackState } from '../services/tts/packManager';
import { InstallError } from '../services/tts/packManager';

interface VoicePackStore {
  state: PackState | null;
  /** Size offered by the catalog, in bytes (known after the first check). */
  offerBytes: number | null;
  /** Newest pack version in the catalog. */
  offerVersion: number | null;
  progress: DownloadProgress | null;
  error: InstallErrorCode | null;
  busy: 'download' | 'remove' | null;
}

export const useVoicePack = create<VoicePackStore>(() => ({ state: null, offerBytes: null, offerVersion: null, progress: null, error: null, busy: null }));

const set = useVoicePack.setState;

export async function refreshVoicePack(): Promise<void> {
  set({ state: await currentPack() });
}

/** Looks up the pack size in the catalog (needs internet; silent if offline). */
export async function loadOffer(): Promise<void> {
  if (!voicePacks || useVoicePack.getState().offerVersion !== null) return;
  try {
    const [c] = await voicePacks.catalog();
    if (c) set({ offerBytes: c.size, offerVersion: c.version });
  } catch {
    // Offline: the button still works and reports the error when pressed.
  }
}

/** Downloads and installs the pack. Call only after the user agreed. */
export async function downloadVoicePack(): Promise<void> {
  if (!voicePacks || useVoicePack.getState().busy) return;
  set({ busy: 'download', error: null, progress: null });
  try {
    const [c] = await voicePacks.catalog();
    if (!c) throw new InstallError('no_pack');
    set({ offerBytes: c.size, offerVersion: c.version });
    await voicePacks.install(c, (progress) => set({ progress }));
    await packChanged();
  } catch (e) {
    set({ error: e instanceof InstallError ? e.code : 'network' });
  } finally {
    set({ busy: null, progress: null });
    await refreshVoicePack();
  }
}

export function cancelVoicePack(): void {
  voicePacks?.cancel();
}

export async function removeVoicePack(): Promise<void> {
  if (!voicePacks || useVoicePack.getState().busy) return;
  set({ busy: 'remove', error: null });
  try {
    await packChanged();
    await voicePacks.remove();
    await packChanged();
  } finally {
    set({ busy: null });
    await refreshVoicePack();
  }
}
