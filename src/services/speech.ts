// Public speech API used by the screens. The engine choice lives in
// services/tts; screens only ask to speak or to stop.
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { NamuTts } from '../../modules/namu-tts';
import { getDb } from '../db';
import { directionList } from '../state/store';
import { getEntries, planSession } from '../db/repo';
import { createAudioCache, type AudioCache } from './tts/audioCache';
import type { Priority } from './tts/queuePolicy';
import { createSynthQueue, type SynthQueue } from './tts/synthQueue';
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

/** Call after installing or deleting a pack: frees the model and drops audio of other packs. */
export async function packChanged(): Promise<void> {
  packState = null;
  await neural?.unload().catch(() => {});
  const ctx = await neural?.context().catch(() => null);
  await audioCache?.clear(ctx?.pack ?? null).catch(() => {});
  if (!ctx) await synthQueue?.clear().catch(() => {});
  else void refillQueue();
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

NamuTts?.addListener('onEngineReleased', () => {
  neural?.released();
  // Android asked for memory back: give it a minute before loading the model again.
  synthQueue?.pauseFor(60_000, 'memory');
});

/** Audio made by the neural voice, kept on disk (see tts/audioCache.ts). */
export const audioCache: AudioCache | null =
  NamuTts && neural
    ? createAudioCache({
        db: getDb,
        io: { fileSize: NamuTts.fileSize, deleteTree: NamuTts.deleteTree, listDir: NamuTts.listDir },
        dir: `${storage}/tts-cache`,
        sha256: (s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
        synth: (text, out) => neural.synthToFile(text, out),
      })
    : null;
if (audioCache) neural?.attachCache(audioCache);

let foreground = AppState.currentState === 'active';

/** Prepares neural audio in the background (see tts/synthQueue.ts). */
export const synthQueue: SynthQueue | null =
  NamuTts && neural && audioCache
    ? createSynthQueue({
        db: getDb,
        cache: audioCache,
        context: () => neural.context(),
        conditions: () => NamuTts!.conditions(),
        foreground: () => foreground,
        sha256: (s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
      })
    : null;

if (synthQueue && neural) {
  // A word heard with the phone voice is prepared with the neural one right away.
  neural.setPrefetch((text) => void synthQueue.enqueue([text], 0));
  AppState.addEventListener('change', (state) => {
    foreground = state === 'active';
    if (foreground) synthQueue.kick();
  });
}

/**
 * Asks for neural audio of these texts to be prepared ahead of time. Does nothing when
 * the user chose the phone voice or no voice pack is installed. Independent of autoSpeak:
 * that setting only decides whether words are played automatically.
 */
export function prepareSpeech(texts: string[], priority: Priority): void {
  if (!synthQueue || useApp.getState().settings.ttsEngine === 'system' || texts.length === 0) return;
  void synthQueue.enqueue(texts, priority).catch(() => {});
}

/** Queues today's words (P2) and, if the user asked for it, every word (P3). */
export async function refillQueue(): Promise<void> {
  if (!synthQueue) return;
  const { settings } = useApp.getState();
  if (settings.ttsEngine === 'system') return;
  const db = await getDb();
  const plan = await planSession(db, { dictionaryIds: [], directions: directionList(settings.directions), now: Date.now(), newPerDay: settings.newPerDay, maxReviews: settings.maxReviews });
  const ids = [...new Set([...plan.fresh, ...plan.learning.map((l) => l.entryId), ...plan.reviews.map((r) => r.entryId)])];
  const words = [...(await getEntries(db, ids)).values()].map((e) => e.korean);
  await synthQueue.enqueue(words, 2);
  if (settings.ttsPrepareAll) {
    const all = await db.getAllAsync<{ korean: string }>(
      'SELECT e.korean FROM entries e JOIN dictionaries d ON d.id = e.dictionary_id WHERE d.is_archived = 0 ORDER BY e.created_at',
      [],
    );
    await synthQueue.enqueue(
      all.map((r) => r.korean),
      3,
    );
  }
}

/** Startup housekeeping; runs in the background after the database is open. */
export async function initSpeech(): Promise<void> {
  await audioCache?.reconcile().catch(() => {});
  if (!synthQueue) return;
  synthQueue.start();
  await refillQueue().catch(() => {});
  // A new voice or engine choice needs its own audio; "prepare everything" off drops P3.
  useApp.subscribe((state, prev) => {
    const a = state.settings;
    const b = prev.settings;
    if (a.ttsVoice !== b.ttsVoice || a.ttsEngine !== b.ttsEngine || (a.ttsPrepareAll && !b.ttsPrepareAll)) void refillQueue().catch(() => {});
    if (!a.ttsPrepareAll && b.ttsPrepareAll) void synthQueue?.drop(3);
  });
}

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
