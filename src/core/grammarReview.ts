// Grammar topics in spaced repetition: one FSRS card per topic, rated by how a drill went.
import { Rating, State, type CardState } from './scheduler';
import type { Grade } from 'ts-fsrs';

/** Drill tasks per topic in a mixed review (a topic page drill has 10). */
export const REVIEW_TASKS_PER_TOPIC = 5;
/** Topics in one mixed review session. */
export const REVIEW_TOPICS_PER_SESSION = 6;
/** Words answered wrong that are kept to be asked first next time. */
const MISSED_KEEP = 6;

/**
 * Rating of a drill: under 60 % right is a lapse, under 85 % hard, otherwise good.
 * A perfect drill is easy only once the topic is already in long-term review.
 */
export function drillRating(correct: number, total: number, card: Pick<CardState, 'state'> | null): Grade {
  if (total <= 0) return Rating.Good;
  const r = correct / total;
  if (r < 0.6) return Rating.Again;
  if (r < 0.85) return Rating.Hard;
  if (r === 1 && card?.state === State.Review) return Rating.Easy;
  return Rating.Good;
}

/** New list of missed words: this drill's mistakes first; words answered right drop out. */
export function nextMissed(previous: string[], wrong: string[], right: string[]): string[] {
  const out: string[] = [];
  for (const w of [...wrong, ...previous]) if (!out.includes(w) && !right.includes(w)) out.push(w);
  return out.slice(0, MISSED_KEEP);
}
