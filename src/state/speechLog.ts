// Recent speech problems, kept in memory only so the user can see on the phone
// why a word was spoken with the phone voice. Holds no spoken text, only its length.
import { create } from 'zustand';

export interface SpeechLogEntry {
  at: number;
  event: string;
  engine?: string;
  error?: string;
  length?: number;
}

const MAX = 40;

export const useSpeechLog = create<{ entries: SpeechLogEntry[] }>(() => ({ entries: [] }));

export function logSpeech(event: string, data: Record<string, unknown> = {}): void {
  const e: SpeechLogEntry = {
    at: Date.now(),
    event,
    engine: typeof data.engine === 'string' ? data.engine : undefined,
    error: typeof data.error === 'string' ? data.error.slice(0, 120) : undefined,
    length: typeof data.length === 'number' ? data.length : undefined,
  };
  useSpeechLog.setState((s) => ({ entries: [e, ...s.entries].slice(0, MAX) }));
}

export function clearSpeechLog(): void {
  useSpeechLog.setState({ entries: [] });
}
