// Shared types of the speech layer. Nothing here imports React Native, so the
// selection logic can be tested in Node.

/** Speech engines the app knows about. */
export type EngineId = 'supertonic' | 'system';
/** What the user picked in settings. "auto" prefers the neural voice when it is installed. */
export type EnginePreference = 'auto' | EngineId;

export const ENGINE_PREFERENCES: readonly EnginePreference[] = ['auto', 'supertonic', 'system'];

export interface SpeakRequest {
  /** Text exactly as it should be spoken (already trimmed). */
  text: string;
  /** 1 is the normal speed. */
  rate: number;
  /** False once a newer call has taken over; a slow engine checks it before it starts playing. */
  isCurrent: () => boolean;
}

export interface TtsEngine {
  readonly id: EngineId;
  /** Whether the engine can speak Korean right now. Must not throw. */
  isReady(): Promise<boolean>;
  /**
   * Starts playback. Resolves once playback has started; rejects if it could
   * not start, so the service can fall back to the next engine.
   */
  play(req: SpeakRequest): Promise<void>;
  /** Stops any playback of this engine. Must be safe to call when idle. */
  stop(): Promise<void>;
}

export type SpeakOutcome =
  | { ok: true; engine: EngineId }
  | { ok: false; reason: 'empty' | 'no_voice' | 'superseded' | 'failed' };
