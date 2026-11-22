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

describe('cache limit setting', () => {
  it('accepts only the offered sizes', async () => {
    const { settingsFromPrefs, DEFAULT_SETTINGS } = await import('./store');
    expect(DEFAULT_SETTINGS.ttsCacheLimitMb).toBe(250);
    expect(settingsFromPrefs({ ttsCacheLimitMb: '500' }).ttsCacheLimitMb).toBe(500);
    expect(settingsFromPrefs({ ttsCacheLimitMb: '7' }).ttsCacheLimitMb).toBe(250);
  });
});
