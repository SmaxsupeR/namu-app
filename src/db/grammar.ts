// Grammar review cards: storage of the FSRS card of each grammar topic.
import { newId } from '../core/id';
import { drillRating, nextMissed } from '../core/grammarReview';
import { newCard, reviewCard, type CardState } from '../core/scheduler';
import type { Db } from './schema';

export interface GrammarCard extends CardState {
  topicId: string;
  missed: string[];
}

interface Row {
  topic_id: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
  missed: string;
}

function parseMissed(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

function fromRow(r: Row): GrammarCard {
  const { topic_id, missed, ...card } = r;
  return { ...(card as CardState), topicId: topic_id, missed: parseMissed(missed) };
}

export async function getGrammarCards(db: Db): Promise<Map<string, GrammarCard>> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM grammar_cards', []);
  return new Map(rows.map((r) => [r.topic_id, fromRow(r)]));
}

export async function getGrammarCard(db: Db, topicId: string): Promise<GrammarCard | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM grammar_cards WHERE topic_id = ?', [topicId]);
  return r ? fromRow(r) : null;
}

/** Topics due now, most overdue first, only among topics that still exist. */
export async function dueGrammarTopics(db: Db, now: number, known: readonly string[]): Promise<string[]> {
  const rows = await db.getAllAsync<{ topic_id: string }>('SELECT topic_id FROM grammar_cards WHERE due <= ? ORDER BY due', [now]);
  const set = new Set(known);
  return rows.map((r) => r.topic_id).filter((id) => set.has(id));
}

export interface DrillResult {
  topicId: string;
  correct: number;
  total: number;
  /** Words (base forms) answered wrong / right in this drill. */
  wrong: string[];
  right: string[];
}

/** Schedules a topic after a drill. The first drill of a topic creates its card. */
export async function recordGrammarDrill(db: Db, result: DrillResult, now: number, retention: number): Promise<GrammarCard> {
  const prev = await getGrammarCard(db, result.topicId);
  const rating = drillRating(result.correct, result.total, prev);
  const { card } = reviewCard(prev ?? newCard(now), rating, now, retention);
  const missed = nextMissed(prev?.missed ?? [], result.wrong, result.right);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO grammar_cards (topic_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, missed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
         elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps,
         reps = excluded.reps, lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review, missed = excluded.missed`,
      [result.topicId, card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days, card.learning_steps, card.reps, card.lapses, card.state, card.last_review, JSON.stringify(missed)],
    );
    await db.runAsync(
      'INSERT INTO grammar_history (id, topic_id, rating, correct, total, state, due, stability, difficulty, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newId(), result.topicId, rating, result.correct, result.total, card.state, card.due, card.stability, card.difficulty, now],
    );
  });
  return { ...card, topicId: result.topicId, missed };
}
