// Download state of the pre-made dictionary audio, shared by screens.
import { create } from 'zustand';
import { dictAudioChanged, dictAudioInstalled, dictAudioPack, synthQueue } from '../services/speech';
import { DictAudioFailure, type DictAudioError, type DictAudioInstalled, type DictAudioOffer } from '../services/tts/dictAudio';

interface DictAudioStore {
  installed: DictAudioInstalled | null;
  offer: DictAudioOffer | null;
  progress: { done: number; total: number } | null;
  busy: boolean;
  error: DictAudioError | null;
}

export const useDictAudio = create<DictAudioStore>(() => ({ installed: null, offer: null, progress: null, busy: false, error: null }));
const set = useDictAudio.setState;

export async function refreshDictAudio(): Promise<void> {
  set({ installed: await dictAudioInstalled() });
  if (dictAudioPack && !useDictAudio.getState().offer) {
    try {
      set({ offer: await dictAudioPack.offer() });
    } catch {
      // Offline: no offer yet.
    }
  }
}

/** Call only after the user agreed. */
export async function downloadDictAudio(): Promise<void> {
  if (!dictAudioPack || useDictAudio.getState().busy) return;
  set({ busy: true, error: null, progress: null });
  try {
    const offer = useDictAudio.getState().offer ?? (await dictAudioPack.offer());
    if (!offer) throw new DictAudioFailure('no_pack');
    set({ offer });
    await dictAudioPack.install(offer, (done, total) => set({ progress: { done, total } }));
    dictAudioChanged();
    // Words now in the pack need no synthesis.
    await synthQueue?.drop(3);
  } catch (e) {
    set({ error: e instanceof DictAudioFailure ? e.code : 'network' });
  } finally {
    set({ busy: false, progress: null });
    await refreshDictAudio();
  }
}

export function cancelDictAudio(): void {
  dictAudioPack?.cancel();
}

export async function removeDictAudio(): Promise<void> {
  await dictAudioPack?.remove();
  dictAudioChanged();
  await refreshDictAudio();
}
