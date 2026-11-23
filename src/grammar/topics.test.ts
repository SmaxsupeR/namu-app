import { describe, expect, it } from 'vitest';
import { checkDrill, DRILL_WORDS, makeDrill } from './drill';
import { conjugate } from './conjugate';
import { GROUPS, topicById, TOPICS } from './topics';

describe('grammar reference', () => {
  it('has unique ids, known groups, examples and valid links', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    expect(ids.size).toBe(TOPICS.length);
    for (const t of TOPICS) {
      expect(GROUPS.some((g) => g.id === t.group)).toBe(true);
      expect(t.examples.length).toBeGreaterThanOrEqual(2);
      for (const e of t.examples) {
        expect(e.ko).toMatch(/[가-힣]/);
        expect(e.ru).toMatch(/[а-яё]/i);
      }
      for (const r of t.related ?? []) expect(ids.has(r), `${t.id} → ${r}`).toBe(true);
    }
    expect(TOPICS.length).toBeGreaterThanOrEqual(40);
  });

  it('builds a full drill for every topic that has one', () => {
    for (const t of TOPICS.filter((x) => x.drill)) {
      const tasks = makeDrill(t, 10, () => 0.42);
      expect(tasks.length, t.id).toBe(10);
      for (const task of tasks) {
        expect(task.answer).not.toBe(task.base);
        expect(checkDrill(task, ` ${task.answer}. `)).toBe(true);
      }
    }
  });

  it('every drill word conjugates', () => {
    for (const w of DRILL_WORDS) expect(conjugate(w.word, w.kind), w.word).not.toBeNull();
  });

  it('checks answers strictly apart from spacing and final punctuation', () => {
    const [task] = makeDrill(topicById('polite')!, 1, () => 0);
    expect(checkDrill(task, task.answer)).toBe(true);
    expect(checkDrill(task, task.answer + '요')).toBe(false);
    const future = makeDrill(topicById('future')!, 10, () => 0.3)[0];
    expect(checkDrill(future, future.answer.replace(' ', '  '))).toBe(true);
  });

  it('gives particle drills with the right form', () => {
    const tasks = makeDrill(topicById('direction')!, 20, () => 0.5);
    expect(tasks.find((t) => t.base === '서울')?.answer).toBe('서울로');
    expect(tasks.find((t) => t.base === '집')?.answer).toBe('집으로');
  });
});
