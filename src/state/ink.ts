// Handwriting model download state and the lab's attempts, shared by screens.
import { create } from 'zustand';
import { NamuTts } from '../../modules/namu-tts';
import { InkFailure, LAB_FILE, parseInkAttempts, type InkAttempt, type InkError, type InkInstalled, type InkOffer } from '../services/ink';
import { inkPack, inkRoot } from '../services/speech';

interface InkStore {
  installed: InkInstalled | null;
  offer: InkOffer | null;
  progress: { done: number; total: number } | null;
  busy: boolean;
  error: InkError | null;
  attempts: InkAttempt[];
}

export const useInk = create<InkStore>(() => ({ installed: null, offer: null, progress: null, busy: false, error: null, attempts: [] }));
const set = useInk.setState;
const labFile = `${inkRoot}/${LAB_FILE}`;

export async function refreshInk(): Promise<void> {
  if (!inkPack) return;
  set({ installed: await inkPack.installed() });
  if (NamuTts) set({ attempts: parseInkAttempts(await NamuTts.readText(labFile).catch(() => null)) });
  if (!useInk.getState().offer) {
    try {
      set({ offer: await inkPack.offer() });
    } catch {
      // Offline: no offer yet.
    }
  }
}

/** Call only after the user agreed. */
export async function downloadInk(): Promise<void> {
  if (!inkPack || useInk.getState().busy) return;
  set({ busy: true, error: null, progress: null });
  try {
    const offer = useInk.getState().offer ?? (await inkPack.offer());
    if (!offer) throw new InkFailure('no_pack');
    set({ offer });
    await NamuTts?.inkRelease();
    await inkPack.install(offer, (done, total) => set({ progress: { done, total } }));
  } catch (e) {
    set({ error: e instanceof InkFailure ? e.code : 'network' });
  } finally {
    set({ busy: false, progress: null });
    await refreshInk();
  }
}

export function cancelInk(): void {
  inkPack?.cancel();
}

export async function removeInk(): Promise<void> {
  await NamuTts?.inkRelease();
  await inkPack?.remove();
  await refreshInk();
}

export async function addInkAttempt(a: InkAttempt): Promise<void> {
  const attempts = [...useInk.getState().attempts, a];
  set({ attempts });
  await NamuTts?.writeTextAtomic(labFile, JSON.stringify(attempts));
}

export async function clearInkAttempts(): Promise<void> {
  set({ attempts: [] });
  await NamuTts?.writeTextAtomic(labFile, '[]');
}
