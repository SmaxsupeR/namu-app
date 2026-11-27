// The phone's own text-to-speech (Android TTS). Kept as the fallback voice.
import * as Speech from 'expo-speech';
import type { TtsEngine } from './types';

let koreanVoice: boolean | null = null;

/** Whether the device's text-to-speech engine has a Korean voice installed. */
export async function hasKoreanVoice(): Promise<boolean> {
  // A missing voice is checked again next time: the user may install one meanwhile.
  if (koreanVoice === true) return true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    koreanVoice = voices.some((v) => v.language?.toLowerCase().startsWith('ko'));
  } catch {
    koreanVoice = false;
  }
  return koreanVoice;
}

export const systemEngine: TtsEngine = {
  id: 'system',
  isReady: hasKoreanVoice,
  async play({ text, rate }) {
    // Phone voices speak a little fast for learners: 0.9 of their own speed is "normal" here.
    Speech.speak(text, { language: 'ko-KR', rate: 0.9 * rate });
  },
  async stop() {
    await Speech.stop();
  },
};
