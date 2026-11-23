import { describe, expect, it } from 'vitest';
import { headwordSpeech } from './speech';

describe('headwordSpeech', () => {
  it.each([
    ['학교', '학교'],
    ['-가', '가'],
    ['비위(가) 사납다', '비위가 사납다'],
    ['거리에/로 나앉다', '거리에 나앉다'],
    ['뒷다리(가/를) 잡히다', '뒷다리가 잡히다'],
    ['간이 덜렁[덜컹/철렁]하다', '간이 덜렁하다'],
    ['고혈을 짜다[짜내다/빨다]', '고혈을 짜다'],
  ])('%s → %s', (a, b) => expect(headwordSpeech(a)).toBe(b));
  it('skips entries that are only jamo endings', () => {
    expect(headwordSpeech('-ㄴ다')).toBeNull();
    expect(headwordSpeech('abc')).toBeNull();
  });
});
