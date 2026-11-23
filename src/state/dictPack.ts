// Status of the full dictionary download, shared by every screen.
import { create } from 'zustand';
import { dictionaryEdition, dictPack, reopenDictionary, type Edition } from '../dict';
import { DictError, type DictErrorCode, type DictOffer } from '../dict/fullPack';

interface DictPackStore {
  edition: Edition | null;
  offer: DictOffer | null;
  progress: { done: number; total: number; phase: 'download' | 'unpack' } | null;
  busy: boolean;
  error: DictErrorCode | null;
}

export const useDictPack = create<DictPackStore>(() => ({ edition: null, offer: null, progress: null, busy: false, error: null }));
const set = useDictPack.setState;

export const fullDictSupported = dictPack !== null;

export async function refreshDictPack(): Promise<void> {
  set({ edition: await dictionaryEdition().catch(() => null) });
  if (dictPack && !useDictPack.getState().offer) {
    try {
      set({ offer: await dictPack.offer() });
    } catch {
      // Offline: the offer appears next time.
    }
  }
}

/** Downloads and switches to the full dictionary. Call only after the user agreed. */
export async function downloadFullDict(): Promise<void> {
  if (!dictPack || useDictPack.getState().busy) return;
  set({ busy: true, error: null, progress: null });
  try {
    const offer = useDictPack.getState().offer ?? (await dictPack.offer());
    if (!offer) throw new DictError('no_pack');
    set({ offer });
    await dictPack.install(offer, (done, total, phase) => set({ progress: { done, total, phase } }));
    await reopenDictionary();
  } catch (e) {
    set({ error: e instanceof DictError ? e.code : 'network' });
  } finally {
    set({ busy: false, progress: null });
    await refreshDictPack();
  }
}

export function cancelFullDict(): void {
  dictPack?.cancel();
}

export async function removeFullDict(): Promise<void> {
  if (!dictPack) return;
  await reopenDictionary();
  await dictPack.remove();
  await refreshDictPack();
}
