import { describe, expect, it } from 'vitest';
import { makeDrill } from './drill';
import { TOPICS } from './topics';

describe('words missed last time', () => {
  it('are asked first', () => {
    const topic = TOPICS.find((x) => x.drill?.kind === 'form' && x.drill.form === 'polite')!;
    const tasks = makeDrill(topic, 5, () => 0.5, ['듣다', '돕다']);
    expect(tasks.slice(0, 2).map((x) => x.base)).toEqual(['듣다', '돕다']);
    expect(new Set(tasks.map((x) => x.base)).size).toBe(5);
  });
  it('are asked first in particle drills too, and unknown words are ignored', () => {
    const topic = TOPICS.find((x) => x.drill?.kind === 'particle')!;
    const tasks = makeDrill(topic, 4, () => 0.5, ['학교', 'нет такого']);
    expect(tasks[0].base).toBe('학교');
    expect(tasks).toHaveLength(4);
  });
});
