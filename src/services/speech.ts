// Public speech API used by the screens. The engine choice lives in
// services/tts; screens only ask to speak or to stop.
import { useApp } from '../state/store';
import { createSpeechService } from './tts/service';
import { hasKoreanVoice, systemEngine } from './tts/systemEngine';
import type { SpeakOutcome, TtsEngine } from './tts/types';

export { hasKoreanVoice };

const engines: TtsEngine[] = [systemEngine];

/** Adds an engine (the neural voice registers itself once its pack is installed). */
export function registerEngine(engine: TtsEngine) {
  const i = engines.findIndex((e) => e.id === engine.id);
  if (i >= 0) engines[i] = engine;
  else engines.unshift(engine);
}

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

export function stopSpeech(): Promise<void> {
  return service.stop();
}
