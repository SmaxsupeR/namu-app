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
});
