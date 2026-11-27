import { describe, expect, it } from 'vitest';
import { DEFAULT_FREE, parseFreeChoice } from './freePractice';

describe('free practice choice', () => {
  it('defaults: 20 words, all dictionaries, both directions, keyboard', () => {
    expect(parseFreeChoice(null)).toEqual({ dicts: [], dirs: 'both', method: 'keyboard', limit: 20 });
    expect(parseFreeChoice('{broken')).toEqual(DEFAULT_FREE);
  });
  it('keeps valid values and drops invalid ones and deleted dictionaries', () => {
    expect(parseFreeChoice(JSON.stringify({ dicts: ['a', 'gone', 3], dirs: 'ru_ko', method: 'choice', limit: 50 }), ['a', 'b'])).toEqual({ dicts: ['a'], dirs: 'ru_ko', method: 'choice', limit: 50 });
    expect(parseFreeChoice(JSON.stringify({ dirs: 'sideways', method: 'telepathy', limit: 7 }))).toEqual(DEFAULT_FREE);
  });
});
