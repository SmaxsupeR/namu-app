import { describe, expect, it } from 'vitest';
import { attemptSkill, listeningAnswerSide } from './exercises';
import { createFreeSession, answer, currentTask } from './learning';
import { listenGapMs } from './listening';
import { decideRating } from './rating';

describe('listening', () => {
  it('audio and dictation prompts are listening, whatever the answer method', () => {
    expect(attemptSkill('choice', 'audio')).toBe('listening');
    expect(attemptSkill('keyboard', 'dictation')).toBe('listening');
    expect(attemptSkill('self_grade', 'audio')).toBe('listening');
    expect(attemptSkill('keyboard', 'text')).toBe('recall');
    expect(listeningAnswerSide('audio')).toBe('ko_ru');
    expect(listeningAnswerSide('dictation')).toBe('ru_ko');
  });

  it('a listening session records listening attempts and never rates FSRS, even for a due card', () => {
    const s = createFreeSession({
      cards: [{ entryId: 'e1', direction: 'ko_ru', status: 'scheduled', due: true, introduced: true }],
      method: 'keyboard',
      prompt: 'audio',
      countAsReview: true,
    });
    expect(s.countAsReview).toBe(false);
    const task = currentTask(s)!;
    expect(task.kind).not.toBe('intro');
    const step = answer(s, { correct: true, given: 'x', at: 1000 });
    const attempt = step.effects.find((e) => e.type === 'attempt') as { type: 'attempt'; result: { skill: string } } | undefined;
    expect(attempt?.result.skill).toBe('listening');
    expect(step.effects.some((e) => e.type === 'review' || e.type === 'graduate')).toBe(false);
  });

  it('the rating policy keeps listening out of the schedule', () => {
    const r = decideRating({} as never, { skill: 'listening', method: 'keyboard', correct: true, selfGrade: null, hintsUsed: 0 });
    expect(r.kind).toBe('log_only');
  });

  it('waits longer for longer words and slower speech', () => {
    expect(listenGapMs('사과', 1)).toBeLessThan(listenGapMs('사과나무', 1));
    expect(listenGapMs('사과', 0.75)).toBeGreaterThan(listenGapMs('사과', 1));
    expect(listenGapMs('abc', 1)).toBeGreaterThan(1800);
  });
});
