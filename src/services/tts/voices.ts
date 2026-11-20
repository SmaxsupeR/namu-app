// The ten Supertonic 3 voices shipped in the Namu voice pack.

export const VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;
export type VoiceId = (typeof VOICES)[number];
export const DEFAULT_VOICE: VoiceId = 'F1';

export function isVoiceId(v: unknown): v is VoiceId {
  return typeof v === 'string' && (VOICES as readonly string[]).includes(v);
}

/** "female" or "male" plus a number, for labels such as "Женский 2". */
export function voiceKind(v: VoiceId): { female: boolean; n: number } {
  return { female: v.startsWith('F'), n: Number(v.slice(1)) };
}
