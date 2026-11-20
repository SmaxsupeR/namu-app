// Public speech API used by the screens. The engine choice lives in
// services/tts; screens only ask to speak or to stop.
import { NamuTts } from '../../modules/namu-tts';
import { useApp } from '../state/store';
import { createPackManager, type PackIO } from './tts/packManager';
import type { PackState } from './tts/packManager';
import { createSpeechService } from './tts/service';
import { createSupertonicEngine, type SupertonicEngine } from './tts/supertonicEngine';
import { hasKoreanVoice, systemEngine } from './tts/systemEngine';
import type { SpeakOutcome, TtsEngine } from './tts/types';

export { hasKoreanVoice };

/** Whether this build can run the neural voice at all (Android with the native module). */
export const neuralSupported = NamuTts !== null;

function nativeIO(): PackIO {
  const n = NamuTts!;
  return {
    fileSize: n.fileSize,
    exists: n.exists,
    readText: n.readText,
    writeTextAtomic: n.writeTextAtomic,
    moveDir: n.moveDir,
    deleteTree: n.deleteTree,
    listDir: n.listDir,
    sha256: n.sha256,
    freeSpaceMb: n.freeSpaceMb,
    cancelDownload: () => n.cancelDownload(),
    async download(url, dest, size, onBytes) {
      const sub = n.addListener('onDownloadProgress', (e) => {
        if (e.dest === dest) onBytes(e.bytes);
      });
      try {
        return await n.download(url, dest, size);
      } finally {
        sub.remove();
      }
    },
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const storage = NamuTts ? NamuTts.storageDir() : '';

/** Voice pack management; null where the neural voice is not supported. */
export const voicePacks = NamuTts ? createPackManager(nativeIO(), `${storage}/voices`, fetchJson) : null;

// The pack state is read from disk once and kept until the pack changes.
let packState: Promise<PackState> | null = null;
export function currentPack(): Promise<PackState> {
  if (!voicePacks) return Promise.resolve({ status: 'none' });
  packState ??= voicePacks.state().catch(() => ({ status: 'none' }) as PackState);
  return packState;
}

/** Call after installing or deleting a pack. */
export async function packChanged(): Promise<void> {
  packState = null;
  await neural?.unload().catch(() => {});
}

/** The neural engine; null where it is not supported. */
export const neural: SupertonicEngine | null = NamuTts
  ? createSupertonicEngine({
      native: NamuTts,
      packState: currentPack,
      voice: () => useApp.getState().settings.ttsVoice,
      tmpDir: `${storage}/tts-tmp`,
    })
  : null;

NamuTts?.addListener('onEngineReleased', () => neural?.released());

const engines: TtsEngine[] = neural ? [neural, systemEngine] : [systemEngine];

const service = createSpeechService({
  engines: () => engines,
  preference: () => useApp.getState().settings.ttsEngine,
});

/** Speaks Korean text with the best available voice. */
export function speak(text: string, rate = 0.9): Promise<SpeakOutcome> {
  return service.speak(text, { rate });
}

/**
 * Speaks Korean text. Returns false when no voice could speak it, so the
 * caller can tell the user. A call overtaken by a newer one counts as success:
 * the newer call is the one the user hears.
 */
export async function speakKorean(text: string, rate = 0.9): Promise<boolean> {
  const r = await service.speak(text, { rate });
  return r.ok || r.reason === 'superseded' || r.reason === 'empty';
}

/** Plays a sample with the neural voice only (for choosing a voice); false if it cannot run. */
export async function previewNeural(text: string): Promise<boolean> {
  if (!neural) return false;
  await service.stop();
  try {
    await neural.play({ text, rate: 1, isCurrent: () => true });
    return true;
  } catch {
    return false;
  }
}

export function stopSpeech(): Promise<void> {
  return service.stop();
}
