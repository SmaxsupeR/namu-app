// App settings, kept in memory and saved to the user_preferences table.
import { create } from 'zustand';
import type { Direction } from '../core/learning';
import { ENGINE_PREFERENCES, type EnginePreference } from '../services/tts/types';
import { DEFAULT_VOICE, isVoiceId, type VoiceId } from '../services/tts/voices';

export type Language = 'ru' | 'en';
/** Which directions are practised: both, or only one of them. */
export type DirectionSetting = 'both' | Direction;

export function directionList(setting: DirectionSetting): Direction[] {
  return setting === 'both' ? ['ko_ru', 'ru_ko'] : [setting];
}

/** Speech speed choices: slow, calm, normal, fast (1 = normal). */
export const SPEECH_RATES = [0.75, 0.9, 1, 1.15];
/** One-off "slower" replay in listening exercises. */
export const SLOW_RATE = 0.7;

/** Choices for the size of the neural-voice audio cache. */
export const CACHE_LIMITS_MB = [100, 250, 500, 1000];

export interface Settings {
  language: Language;
  newPerDay: number;
  maxReviews: number;
  retention: number;
  showRomanization: boolean;
  directions: DirectionSetting;
  strictSpacing: boolean;
  autoSpeak: boolean;
  /** How recall questions are answered in planned study. */
  answerMethod: 'keyboard' | 'self_grade';
  /** Self-assessed cards: four grades instead of two. */
  detailedGrading: boolean;
  /** Free practice: attempts per word before it leaves the session. */
  practiceAttempts: number;
  /** Which voice speaks Korean: the neural one when installed, or the phone's own. */
  ttsEngine: EnginePreference;
  /** Neural voice: F1–F5 (female) or M1–M5 (male). */
  ttsVoice: VoiceId;
  /** Prepare neural audio for every word ahead of time (asked once; uses battery and storage). */
  ttsPrepareAll: boolean;
  /** Space neural-voice recordings may take, in MB. */
  ttsCacheLimitMb: number;
  /** Speed of Korean speech, 1 = normal (one of SPEECH_RATES). */
  speechRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'ru',
  newPerDay: 10,
  maxReviews: 100,
  retention: 0.9,
  showRomanization: true,
  directions: 'both',
  strictSpacing: false,
  autoSpeak: true,
  answerMethod: 'keyboard',
  detailedGrading: false,
  practiceAttempts: 3,
  ttsEngine: 'auto',
  ttsVoice: DEFAULT_VOICE,
  ttsPrepareAll: false,
  ttsCacheLimitMb: 250,
  speechRate: 1,
};

export function settingsFromPrefs(prefs: Record<string, string>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!(key in prefs)) continue;
    try {
      const value = JSON.parse(prefs[key]);
      if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
      if (key === 'directions' && !['both', 'ko_ru', 'ru_ko'].includes(value)) continue;
      if (key === 'answerMethod' && !['keyboard', 'self_grade'].includes(value)) continue;
      if (key === 'ttsEngine' && !ENGINE_PREFERENCES.includes(value)) continue;
      if (key === 'ttsVoice' && !isVoiceId(value)) continue;
      if (key === 'ttsCacheLimitMb' && !CACHE_LIMITS_MB.includes(value)) continue;
      if (key === 'speechRate' && !SPEECH_RATES.includes(value)) continue;
      if (key === 'practiceAttempts' && !(value >= 1 && value <= 10)) continue;
      (out as unknown as Record<string, unknown>)[key] = value;
    } catch {
      // A damaged value falls back to the default.
    }
  }
  return out;
}

interface AppState {
  settings: Settings;
  /** Bumped after every write so open screens reload their data. */
  dataVersion: number;
  setSettings: (s: Settings) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  touch: () => void;
}

export const useApp = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  dataVersion: 0,
  setSettings: (settings) => set({ settings }),
  patchSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  touch: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));
