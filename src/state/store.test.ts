import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsFromPrefs } from './store';

describe('settings', () => {
  it('defaults to automatic voice choice', () => {
    expect(DEFAULT_SETTINGS.ttsEngine).toBe('auto');
  });
  it('accepts known engines and rejects unknown ones', () => {
    expect(settingsFromPrefs({ ttsEngine: '"system"' }).ttsEngine).toBe('system');
    expect(settingsFromPrefs({ ttsEngine: '"robot"' }).ttsEngine).toBe('auto');
    expect(settingsFromPrefs({ ttsEngine: 'not json' }).ttsEngine).toBe('auto');
  });
  it('keeps only known voices', () => {
    expect(DEFAULT_SETTINGS.ttsVoice).toBe('F1');
    expect(settingsFromPrefs({ ttsVoice: '"M3"' }).ttsVoice).toBe('M3');
    expect(settingsFromPrefs({ ttsVoice: '"X9"' }).ttsVoice).toBe('F1');
  });
});
