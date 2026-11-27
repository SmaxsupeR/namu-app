import { describe, expect, it } from 'vitest';
import { koreanSize } from './koreanSize';

describe('size of the main Korean text', () => {
  it('is 56 sp for usual words and shrinks to 36 sp for long ones', () => {
    expect(koreanSize('학교').fontSize).toBe(56);
    expect(koreanSize('선생님').fontSize).toBe(56);
    expect(koreanSize('지하철역').fontSize).toBe(56);
    expect(koreanSize('아르바이트').fontSize).toBe(50);
    expect(koreanSize('스마트폰게임').fontSize).toBe(44);
    expect(koreanSize('국제연합안전보장이사회').fontSize).toBe(36);
  });
  it('treats text with spaces as a phrase or sentence: 28–36 sp', () => {
    expect(koreanSize('비위가 사납다').fontSize).toBe(36);
    expect(koreanSize('저는 학교에 가요').fontSize).toBeLessThanOrEqual(36);
    expect(koreanSize('농부들은 한낮의 햇볕을 피해 나무 그늘 아래에서 쉬었다.').fontSize).toBe(28);
  });
  it('keeps line height above the font size (no clipped Hangul)', () => {
    for (const w of ['학', '학교', '국제연합안전보장이사회', '저는 학교에 가요']) {
      const s = koreanSize(w);
      expect(s.lineHeight).toBeGreaterThanOrEqual(s.fontSize * 1.3);
      expect(s.fontSize).toBeGreaterThanOrEqual(28);
      expect(s.fontSize).toBeLessThanOrEqual(56);
    }
  });
});
